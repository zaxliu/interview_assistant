import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractMeetingNotesInsights, generateQuestions, processResumeText } from './ai';

describe('ai api parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses JSON wrapped in a markdown code block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '```json\n[{"text":"介绍一下你做过的项目","source":"resume","evaluationDimension":"专业能力","context":"项目A"}]\n```',
              },
            },
          ],
        }),
      })
    );

    const questions = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      text: '介绍一下你做过的项目',
      source: 'resume',
      evaluationDimension: '专业能力',
      context: '项目A',
      isAIGenerated: true,
    });
  });

  it('returns an empty array when the response is invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not-json' } }],
        }),
      })
    );

    await expect(
      generateQuestions({ apiKey: 'key', model: 'model' }, 'JD', 'Resume', [])
    ).resolves.toEqual([]);
  });

  it('tops up generated questions when first response count is too low', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n[{"text":"讲讲你在项目A里的职责","source":"resume","evaluationDimension":"专业能力","context":"项目A"},{"text":"为什么想加入我们团队？","source":"common","evaluationDimension":"适配度","context":""}]\n```',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n{"questions":[{"text":"讲讲你在项目A里的职责","source":"resume","evaluationDimension":"专业能力","context":"项目A"},{"text":"如何做线上故障定位？","source":"coding","evaluationDimension":"专业能力","context":""},{"text":"你如何权衡交付质量和速度？","source":"jd","evaluationDimension":"通用素质","context":"快速交付"},{"text":"遇到跨团队协作冲突你怎么处理？","source":"common","evaluationDimension":"通用素质","context":""},{"text":"为什么选择这份工作？","source":"common","evaluationDimension":"适配度","context":""},{"text":"描述一次复杂问题拆解过程","source":"resume","evaluationDimension":"专业能力","context":"复杂系统"},{"text":"你如何推动项目落地？","source":"jd","evaluationDimension":"通用素质","context":"推动执行"},{"text":"未来两年职业规划是什么？","source":"common","evaluationDimension":"适配度","context":""}]}\n```',
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const questions = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(questions.length).toBeGreaterThanOrEqual(8);
    expect(new Set(questions.map((q) => q.text)).size).toBe(questions.length);
  });

  it('processes resume text into markdown and highlights', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n{"markdown":"# Alice\\n\\n## Experience\\n- Built APIs","highlights":{"summary":"Backend engineer","strengths":["API design"],"risks":["Domain depth"],"experience":["Built APIs at X"],"keywords":["Go","Redis"]}}\n```',
              },
            },
          ],
        }),
      })
    );

    await expect(processResumeText({ apiKey: 'key', model: 'model' }, 'raw text')).resolves.toEqual({
      markdown: '# Alice\n\n## Experience\n- Built APIs',
      highlights: {
        summary: 'Backend engineer',
        strengths: ['API design'],
        risks: ['Domain depth'],
        experience: ['Built APIs at X'],
        keywords: ['Go', 'Redis'],
      },
    });
  });

  it('extracts matched answers and new qa from meeting notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n{"matched_answers":[{"question_id":"q-1","answer":"讲了 checkpoint 自动恢复","evidence":"提到异常后加载 checkpoint"}],"new_qa":[{"question":"如何做故障节点隔离？","answer":"打污点并迁移任务","source":"coding","evaluation_dimension":"专业能力"}]}\n```',
              },
            },
          ],
        }),
      })
    );

    const result = await extractMeetingNotesInsights(
      { apiKey: 'key', model: 'model' },
      [{ id: 'q-1', text: '如何保障训练稳定性？', source: 'common', isAIGenerated: true, status: 'not_reached' }],
      'meeting notes'
    );

    expect(result.matchedAnswers).toEqual([
      {
        questionId: 'q-1',
        answer: '讲了 checkpoint 自动恢复',
        evidence: '提到异常后加载 checkpoint',
      },
    ]);
    expect(result.newQAs).toEqual([
      {
        question: '如何做故障节点隔离？',
        answer: '打污点并迁移任务',
        source: 'coding',
        evaluationDimension: '专业能力',
      },
    ]);
  });

  it('drops extracted matched answers that do not map to existing question ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"matched_answers":[{"question_id":"unknown","answer":"something"}],"new_qa":[{"question":"Q","answer":"A","source":"unknown","evaluation_dimension":"unknown"}]}',
              },
            },
          ],
        }),
      })
    );

    const result = await extractMeetingNotesInsights(
      { apiKey: 'key', model: 'model' },
      [{ id: 'q-1', text: 'existing', source: 'common', isAIGenerated: true, status: 'not_reached' }],
      'meeting notes'
    );

    expect(result.matchedAnswers).toEqual([]);
    expect(result.newQAs).toEqual([
      {
        question: 'Q',
        answer: 'A',
        source: 'common',
        evaluationDimension: '专业能力',
      },
    ]);
  });

  it('asks the model to create new questions for uncovered angles and worthwhile follow-up variants in meeting notes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"matched_answers":[],"new_qa":[]}',
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await extractMeetingNotesInsights(
      { apiKey: 'key', model: 'model' },
      [
        {
          id: 'q-1',
          text: '你如何做线上故障排查？',
          source: 'common',
          isAIGenerated: true,
          status: 'not_reached',
        },
      ],
      'meeting notes'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body || '{}'));
    const prompt = body.messages?.[1]?.content || '';

    expect(prompt).toContain('现有问题没有覆盖到的新考察角度');
    expect(prompt).toContain('补充追问、同义改写或换一种问法');
    expect(prompt).toContain('可以同时出现在 matched_answers 和 new_qa');
  });
});
