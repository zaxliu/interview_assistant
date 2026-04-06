import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';
import { usePositionStore } from './positionStore';

const { synthesizePositionMemoryMock } = vi.hoisted(() => ({
  synthesizePositionMemoryMock: vi.fn(),
}));

vi.mock('@/api/ai', () => ({
  synthesizePositionMemory: synthesizePositionMemoryMock,
}));

describe('positionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    synthesizePositionMemoryMock.mockReset();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      aiApiKey: 'test-key',
      aiModel: 'test-model',
    });
  });

  it('adds and updates a candidate', () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Frontend Engineer',
      team: 'Platform',
      description: 'Build UI',
      criteria: [],
      source: 'manual',
    });

    const candidate = usePositionStore.getState().addCandidate(position.id, {
      name: 'Alice',
      status: 'pending',
      interviewTime: '2026-03-11T10:00',
    });

    usePositionStore.getState().updateCandidate(position.id, candidate.id, {
      status: 'scheduled',
    });

    const updated = usePositionStore.getState().getCandidate(position.id, candidate.id);
    expect(updated?.status).toBe('scheduled');
  });

  it('persists interview completion', () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Backend Engineer',
      team: 'Infra',
      description: 'Build APIs',
      criteria: [],
      source: 'manual',
    });
    const candidate = usePositionStore.getState().addCandidate(position.id, {
      name: 'Bob',
      status: 'in_progress',
    });

    usePositionStore.getState().completeInterview(position.id, candidate.id, {
      interview_info: {
        interviewer: 'Jane',
        overall_result: '通过',
        interview_time: '2026-03-11 10:00',
      },
      evaluation_dimensions: [],
      summary: {
        suggested_level: 'P7',
        comprehensive_score: 4,
        overall_comment: 'Strong',
        interview_conclusion: '通过',
        is_strongly_recommended: true,
      },
    });

    const updated = usePositionStore.getState().getCandidate(position.id, candidate.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.interviewResult?.summary.suggested_level).toBe('P7');
  });

  it('records feedback events and marks memory scopes dirty without deriving guidance immediately', () => {
    const position = usePositionStore.getState().addPosition({
      title: 'ML Engineer',
      team: 'AI',
      description: 'Build AI systems',
      criteria: [],
      source: 'manual',
    });
    const candidate = usePositionStore.getState().addCandidate(position.id, {
      name: 'Carla',
      status: 'in_progress',
    });

    usePositionStore.getState().recordFeedbackEvent(position.id, {
      type: 'question_asked',
      candidateId: candidate.id,
      questionId: 'q-1',
      details: {
        source: 'resume',
        evaluationDimension: '专业能力',
      },
    });
    usePositionStore.getState().recordFeedbackEvent(position.id, {
      type: 'summary_rewritten',
      candidateId: candidate.id,
      details: {
        preferences: ['强调证据', '精简篇幅'],
        rewriteIntensity: 'medium',
      },
    });

    const updated = usePositionStore.getState().getPosition(position.id);
    expect(updated?.feedbackEvents?.length).toBe(2);
    expect(updated?.generationGuidance).toBeUndefined();
    expect(updated?.generationMemoryState).toMatchObject({
      dirtyScopes: ['question_generation', 'summary_generation'],
      pendingQuestionEventCount: 1,
      pendingSummaryEventCount: 1,
      pendingQuestionCandidateCount: 1,
      pendingSummaryCandidateCount: 1,
    });
  });

  it('refreshes generation memory from feedback events and clears dirty counters', async () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Data Engineer',
      team: 'AI',
      description: 'Build pipelines',
      criteria: [],
      source: 'manual',
    });
    const candidate = usePositionStore.getState().addCandidate(position.id, {
      name: 'Dora',
      status: 'in_progress',
    });

    usePositionStore.getState().recordFeedbackEvent(position.id, {
      type: 'question_edited',
      candidateId: candidate.id,
      questionId: 'q-1',
      details: {
        source: 'resume',
        evaluationDimension: '专业能力',
        editPattern: '更具体',
      },
    });

    synthesizePositionMemoryMock.mockResolvedValue({
      data: {
        memoryItems: [
          {
            id: 'memory-1',
            scope: 'question_generation',
            kind: 'prioritize',
            instruction: '优先追问具体项目取舍',
            rationale: '用户把泛问题改成了场景化问题',
            evidenceCount: 1,
            confidence: 0.84,
            lastSeenAt: '2026-04-06T10:00:00.000Z',
          },
        ],
        guidancePrompt: '【岗位记忆-问题】\n- 优先追问具体项目取舍',
        updatedAt: '2026-04-06T10:00:00.000Z',
        sampleSize: 1,
        version: 1,
      },
      usage: { input: 33, cached: 4, output: 12 },
    });

    await usePositionStore.getState().refreshGenerationMemory(position.id, 'question_generation');

    const updated = usePositionStore.getState().getPosition(position.id);
    expect(updated?.generationGuidance?.questionGuidance).toContain('岗位记忆-问题');
    expect(updated?.generationMemoryState).toMatchObject({
      dirtyScopes: [],
      pendingQuestionEventCount: 0,
      pendingQuestionCandidateCount: 0,
      lastQuestionRefreshAt: expect.any(String),
      lastQuestionRefreshUsage: { input: 33, cached: 4, output: 12 },
    });
  });

  it('preserves dirty state and old memory when synthesis fails', async () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Data Engineer',
      team: 'AI',
      description: 'Build pipelines',
      criteria: [],
      source: 'manual',
    });

    usePositionStore.getState().updatePosition(position.id, {
      generationMemory: {
        questionMemoryItems: [
          {
            id: 'mem-1',
            scope: 'question_generation',
            kind: 'prioritize',
            instruction: '优先追问召回链路设计',
            rationale: 'old guidance',
            evidenceCount: 3,
            confidence: 0.92,
            lastSeenAt: '2026-04-01T00:00:00.000Z',
          },
        ],
        summaryMemoryItems: [],
        questionGuidancePrompt: '【岗位记忆-问题】\n- 优先追问召回链路设计（证据 3，置信度 0.92）',
        summaryGuidancePrompt: '',
        updatedAt: '2026-04-01T00:00:00.000Z',
        sampleSize: 3,
        version: 1,
      },
      generationMemoryState: {
        dirtyScopes: ['question_generation'],
        pendingQuestionEventCount: 1,
        pendingSummaryEventCount: 0,
        pendingQuestionCandidateCount: 1,
        pendingSummaryCandidateCount: 0,
      },
    });

    synthesizePositionMemoryMock.mockRejectedValue(new Error('AI synthesis failed'));

    const result = await usePositionStore.getState().refreshGenerationMemory(position.id, 'question_generation');
    const updated = usePositionStore.getState().getPosition(position.id);

    expect(result).toMatchObject({
      refreshed: false,
      error: 'AI synthesis failed',
    });
    expect(updated?.generationMemory?.questionGuidancePrompt).toBe(
      '【岗位记忆-问题】\n- 优先追问召回链路设计（证据 3，置信度 0.92）'
    );
    expect(updated?.generationMemoryState).toMatchObject({
      dirtyScopes: ['question_generation'],
      pendingQuestionEventCount: 1,
      pendingQuestionCandidateCount: 1,
    });
  });

  it('does not wipe untouched scope memory during manual refresh when AI returns empty memory', async () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Data Engineer',
      team: 'AI',
      description: 'Build pipelines',
      criteria: [],
      source: 'manual',
    });

    usePositionStore.getState().updatePosition(position.id, {
      generationMemory: {
        questionMemoryItems: [],
        summaryMemoryItems: [
          {
            id: 'mem-1',
            scope: 'summary_generation',
            kind: 'prefer',
            instruction: '结论先行',
            rationale: 'stable',
            evidenceCount: 2,
            confidence: 0.9,
            lastSeenAt: '2026-04-01T00:00:00.000Z',
          },
        ],
        questionGuidancePrompt: '',
        summaryGuidancePrompt: '【岗位记忆-面评】\n- 结论先行',
        updatedAt: '2026-04-01T00:00:00.000Z',
        sampleSize: 2,
        version: 1,
      },
      generationMemoryState: {
        dirtyScopes: ['question_generation'],
        pendingQuestionEventCount: 1,
        pendingSummaryEventCount: 0,
        pendingQuestionCandidateCount: 1,
        pendingSummaryCandidateCount: 0,
      },
    });

    synthesizePositionMemoryMock
      .mockResolvedValueOnce({
        data: {
          memoryItems: [],
          guidancePrompt: '【岗位记忆-问题】暂无足够反馈',
          updatedAt: '2026-04-06T10:00:00.000Z',
          sampleSize: 0,
          version: 1,
        },
        usage: { input: 11, cached: 1, output: 3 },
      })
      .mockRejectedValueOnce(new Error('AI 返回了空的岗位记忆结果'));

    const result = await usePositionStore.getState().refreshGenerationMemory(position.id);
    const updated = usePositionStore.getState().getPosition(position.id);

    expect(result).toMatchObject({
      refreshedScopes: ['question_generation'],
      scopeErrors: {
        summary_generation: 'AI 返回了空的岗位记忆结果',
      },
    });
    expect(updated?.generationMemory?.summaryGuidancePrompt).toBe('【岗位记忆-面评】\n- 结论先行');
    expect(updated?.generationMemory?.summaryMemoryItems).toHaveLength(1);
  });

  it('deduplicates concurrent refresh calls for the same position scope', async () => {
    const position = usePositionStore.getState().addPosition({
      title: 'Data Engineer',
      team: 'AI',
      description: 'Build pipelines',
      criteria: [],
      source: 'manual',
    });
    const candidate = usePositionStore.getState().addCandidate(position.id, {
      name: 'Dora',
      status: 'in_progress',
    });

    usePositionStore.getState().recordFeedbackEvent(position.id, {
      type: 'question_edited',
      candidateId: candidate.id,
      questionId: 'q-1',
      details: {
        source: 'resume',
        evaluationDimension: '专业能力',
        editPattern: '更具体',
      },
    });

    let resolveRefresh!: (value: unknown) => void;
    synthesizePositionMemoryMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const first = usePositionStore.getState().ensureGenerationMemoryFresh(position.id, 'question_generation');
    const second = usePositionStore.getState().refreshGenerationMemory(position.id, 'question_generation');

    expect(synthesizePositionMemoryMock).toHaveBeenCalledTimes(1);

    resolveRefresh({
      data: {
        memoryItems: [],
        guidancePrompt: '【岗位记忆-问题】暂无足够反馈',
        updatedAt: '2026-04-06T10:00:00.000Z',
        sampleSize: 0,
        version: 1,
      },
      usage: { input: 12, cached: 1, output: 5 },
    });

    await expect(first).resolves.toMatchObject({ refreshed: true });
    await expect(second).resolves.toMatchObject({ refreshed: true });
  });
});
