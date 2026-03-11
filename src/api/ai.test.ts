import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateQuestions } from './ai';

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
});
