import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractMeetingNotesInsights, generateQuestions, processResumeText, synthesizePositionMemory } from './ai';

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

    const result = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    const questions = result.data;
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      text: '介绍一下你做过的项目',
      source: 'resume',
      evaluationDimension: '专业能力',
      context: '项目A',
      isAIGenerated: true,
    });
  });

  it('synthesizes position memory through fetch and returns the API usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"memoryItems":[{"scope":"question_generation","kind":"prioritize","instruction":"优先追问候选人在推荐系统里的召回链路设计","rationale":"编辑问题反馈：更具体 / resume / 专业能力","evidenceCount":1,"confidence":0.88,"lastSeenAt":"2026-04-06T08:00:00.000Z"}],"guidancePrompt":"【岗位记忆-问题】\\n- 优先追问候选人在推荐系统里的召回链路设计（证据 1，置信度 0.88）","updatedAt":"2026-04-06T08:00:00.000Z","sampleSize":1,"version":1}',
            },
          },
        ],
        usage: {
          prompt_tokens: 42,
          completion_tokens: 18,
          prompt_tokens_details: {
            cached_tokens: 6,
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesizePositionMemory(
      { apiKey: 'key', model: 'model' },
      'question_generation',
      [],
      [
        {
          scope: 'question_generation',
          eventType: 'question_edited',
          candidateId: 'candidate-1',
          createdAt: '2026-04-06T08:00:00.000Z',
          summary: '编辑问题反馈：更具体 / resume / 专业能力',
          payload: {
            candidateId: 'candidate-1',
            source: 'resume',
            evaluationDimension: '专业能力',
            editPattern: '更具体',
            originalText: '请介绍一下项目',
            editedText: '请具体介绍一下你在推荐系统里的召回链路设计',
          },
        },
      ]
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.usage).toEqual({
      input: 42,
      cached: 6,
      output: 18,
    });
    expect(result.data.guidancePrompt).toContain('岗位记忆-问题');
    expect(result.data.memoryItems[0].scope).toBe('question_generation');
    expect(result.data.memoryItems[0].kind).toBe('prioritize');
    expect(result.data.memoryItems[0].instruction).toContain('召回链路设计');
  });

  it('rejects empty synthesized memory when the scope already has existing items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"memoryItems":[],"guidancePrompt":""}',
              },
            },
          ],
        }),
      })
    );

    await expect(
      synthesizePositionMemory(
        { apiKey: 'key', model: 'model' },
        'summary_generation',
        [
          {
            id: 'memory-1',
            scope: 'summary_generation',
            kind: 'prefer',
            instruction: '结论先行',
            rationale: '已有稳定偏好',
            evidenceCount: 3,
            confidence: 0.9,
            lastSeenAt: '2026-04-06T08:00:00.000Z',
          },
        ],
        []
      )
    ).rejects.toThrow('AI 返回了空的岗位记忆结果');
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
    ).resolves.toEqual({ data: [] });
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

    const result = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    const questions = result.data;
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
      data: {
        markdown: '# Alice\n\n## Experience\n- Built APIs',
        highlights: {
          summary: 'Backend engineer',
          strengths: ['API design'],
          risks: ['Domain depth'],
          experience: ['Built APIs at X'],
          keywords: ['Go', 'Redis'],
        },
      },
    });
  });

  it('processes resume text when the model wraps JSON in prose and content blocks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: '下面是整理结果：\n' },
                  {
                    type: 'text',
                    text:
                      '{"markdown":"# Bob\\n\\n## Experience\\n- Built search","highlights":{"summary":"Search engineer","strengths":["Search relevance"],"risks":[],"experience":["Built ranking pipeline"],"keywords":["Java","Elasticsearch"]}}',
                  },
                ],
              },
            },
          ],
        }),
      })
    );

    await expect(processResumeText({ apiKey: 'key', model: 'model' }, 'raw text')).resolves.toEqual({
      data: {
        markdown: '# Bob\n\n## Experience\n- Built search',
        highlights: {
          summary: 'Search engineer',
          strengths: ['Search relevance'],
          risks: [],
          experience: ['Built ranking pipeline'],
          keywords: ['Java', 'Elasticsearch'],
        },
      },
    });
  });

  it('repairs raw newlines inside markdown JSON strings during resume processing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n{\n  "markdown": "# 候选人 推荐报告\n\n## 推荐职位：大模型推理专家\n- 负责推理优化",\n  "highlights": {\n    "summary": "推理优化工程师",\n    "strengths": ["vLLM"],\n    "risks": [],\n    "experience": ["负责推理优化"],\n    "keywords": ["CUDA"]\n  }\n}\n```',
              },
            },
          ],
        }),
      })
    );

    await expect(processResumeText({ apiKey: 'key', model: 'model' }, 'raw text')).resolves.toEqual({
      data: {
        markdown: '# 候选人 推荐报告\n\n## 推荐职位：大模型推理专家\n- 负责推理优化',
        highlights: {
          summary: '推理优化工程师',
          strengths: ['vLLM'],
          risks: [],
          experience: ['负责推理优化'],
          keywords: ['CUDA'],
        },
      },
    });
  });

  it('retries resume processing with a lighter prompt after a gateway timeout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        statusText: 'Gateway Time-out',
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"markdown":"# Retry\\n\\n- item","highlights":{"summary":"Recovered","strengths":["Fast retry"],"risks":[],"experience":[],"keywords":["retry"]}}',
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(processResumeText({ apiKey: 'key', model: 'model' }, 'raw text')).resolves.toEqual({
      data: {
        markdown: '# Retry\n\n- item',
        highlights: {
          summary: 'Recovered',
          strengths: ['Fast retry'],
          risks: [],
          experience: [],
          keywords: ['retry'],
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a clear error when resume processing times out on all attempts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        statusText: 'Gateway Time-out',
        text: async () => '',
      })
    );

    await expect(processResumeText({ apiKey: 'key', model: 'model' }, 'raw text'))
      .rejects.toThrow('AI 简历整理超时，请重试或更换更快的模型。');
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

    expect(result.data.matchedAnswers).toEqual([
      {
        questionId: 'q-1',
        answer: '讲了 checkpoint 自动恢复',
        evidence: '提到异常后加载 checkpoint',
      },
    ]);
    expect(result.data.newQAs).toEqual([
      {
        question: '如何做故障节点隔离？',
        answer: '打污点并迁移任务',
        source: 'coding',
        evaluationDimension: '专业能力',
      },
    ]);
  });

  it('parses generated questions when JSON is surrounded by extra text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '我已按要求生成。\n[{"text":"介绍一下搜索排序项目","source":"resume","evaluationDimension":"专业能力","context":"搜索排序项目"}]\n请查收。',
              },
            },
          ],
        }),
      })
    );

    const result = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      text: '介绍一下搜索排序项目',
      source: 'resume',
      evaluationDimension: '专业能力',
      context: '搜索排序项目',
    });
  });

  it('repairs invalid backslash escapes in generated question context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '```json\n[{"text":"你提到做了服务端研发，具体怎么做的？","source":"resume","evaluationDimension":"专业能力","context":"智驾模型服务端研发\\#全权负责云端调用逻辑"}]\n```',
              },
            },
          ],
        }),
      })
    );

    const result = await generateQuestions(
      { apiKey: 'key', model: 'model' },
      'JD',
      'Resume',
      []
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      text: '你提到做了服务端研发，具体怎么做的？',
      context: '智驾模型服务端研发\\#全权负责云端调用逻辑',
    });
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

    expect(result.data.matchedAnswers).toEqual([]);
    expect(result.data.newQAs).toEqual([
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

  it('extracts usage for question generation responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '[]',
              },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 45,
            prompt_tokens_details: { cached_tokens: 30 },
          },
        }),
      })
    );

    const result = await generateQuestions({ apiKey: 'key', model: 'model' }, 'JD', 'Resume', []);
    expect(result.usage).toEqual({ input: 240, cached: 60, output: 90 });
  });
});
