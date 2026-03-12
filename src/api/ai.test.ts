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
});
