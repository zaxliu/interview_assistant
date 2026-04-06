import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryEditor } from './SummaryEditor';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';

const { generateInterviewSummary, autofillWintalentEvaluationDraft, ensureGenerationMemoryFresh, analyzeInterviewSummaryRewrite } = vi.hoisted(() => ({
  generateInterviewSummary: vi.fn(),
  autofillWintalentEvaluationDraft: vi.fn(),
  ensureGenerationMemoryFresh: vi.fn(),
  analyzeInterviewSummaryRewrite: vi.fn(),
}));

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    error: null,
    ensureGenerationMemoryFresh,
    generateInterviewSummary,
    analyzeInterviewSummaryRewrite,
  }),
}));

vi.mock('@/api/wintalent', () => ({
  autofillWintalentEvaluationDraft,
  isWintalentInterviewLink: (url: string | undefined) => Boolean(url?.includes('wintalent.cn')),
}));

const position = {
  id: 'position-1',
  title: 'Frontend Engineer',
  description: 'Build product UI',
  team: 'Platform',
  criteria: [],
  createdAt: '2026-03-11T00:00:00.000Z',
  source: 'manual' as const,
  candidates: [],
  userId: 'user-1',
};

const candidate = {
  id: 'candidate-1',
  name: 'Alice',
  candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
  status: 'pending' as const,
  interviewTime: '2026-03-11T10:00:00.000Z',
  questions: [],
  resumeText: 'Resume',
  meetingNotesContext: '纪要小结\n\n【原始面试 Transcript：doc-2】\n完整逐字稿',
  userId: 'user-1',
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('SummaryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      feishuUser: { id: 'user-1', name: 'Lewis', loginTime: '2026-03-11T00:00:00.000Z' },
    });
    usePositionStore.setState({
      ...usePositionStore.getState(),
      positions: [{ ...position, candidates: [candidate] }],
      currentUserId: 'user-1',
    });
  });

  it('autofills wintalent draft and opens evaluation page', async () => {
    autofillWintalentEvaluationDraft.mockResolvedValue({
      evaluationUrl: 'https://www.wintalent.cn/interviewer/interviewPlatform/newpc/jsp/interviewEvaluation.html?x=1',
      candidateLinkUrl: candidate.candidateLink,
    });

    render(<SummaryEditor position={position} candidate={candidate} />);

    fireEvent.click(screen.getAllByRole('button', { name: '一键回填到 Wintalent' })[0]);

    await waitFor(() => {
      expect(autofillWintalentEvaluationDraft).toHaveBeenCalled();
      expect(window.open).toHaveBeenCalledWith(
        'https://www.wintalent.cn/interviewer/interviewPlatform/newpc/jsp/interviewEvaluation.html?x=1',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  it('auto fills interviewer and autosaves edits', async () => {
    render(<SummaryEditor position={position} candidate={candidate} />);

    expect(screen.getByDisplayValue('Lewis')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('请输入对候选人的综合评价...'), {
      target: { value: 'Very strong communication.' },
    });

    await waitFor(
      () => {
        const saved = usePositionStore
          .getState()
          .getCandidate(position.id, candidate.id)?.interviewResult;
        expect(saved?.summary.overall_comment).toBe('Very strong communication.');
      },
      { timeout: 3000 }
    );
  });

  it('auto generates when requested', async () => {
    const refreshDeferred = createDeferred<{
      refreshed: boolean;
      usage: { input: number; cached: number; output: number };
    }>();
    ensureGenerationMemoryFresh.mockReturnValue(refreshDeferred.promise);
    generateInterviewSummary.mockResolvedValue({
      data: {
        interview_info: {
          interviewer: 'Lewis',
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
        additional_info: {
          strengths: ['Communication'],
          concerns: [],
          follow_up_questions: [],
        },
      },
      usage: { input: 10, cached: 2, output: 20 },
    });

    render(<SummaryEditor position={position} candidate={candidate} autoGenerate />);

    expect(screen.queryByText(/面评记忆更新 Token/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('正在更新岗位面评记忆...')).toBeInTheDocument();
    });
    expect(generateInterviewSummary).not.toHaveBeenCalled();

    refreshDeferred.resolve({
      refreshed: true,
      usage: { input: 12, cached: 1, output: 6 },
    });

    await waitFor(() => {
      expect(ensureGenerationMemoryFresh).toHaveBeenCalledWith('position-1', 'summary_generation');
      expect(generateInterviewSummary).toHaveBeenCalled();
      expect(screen.getByDisplayValue('P7')).toBeInTheDocument();
    });

    expect(generateInterviewSummary).toHaveBeenCalledWith(
      candidate.questions,
      position.description,
      candidate.resumeText,
      candidate.name,
      position.title,
      undefined,
      candidate.meetingNotesContext,
      undefined,
      undefined
    );
    await waitFor(() => {
      expect(screen.queryByText('正在更新岗位面评记忆...')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/面评记忆更新 Token/)).toBeInTheDocument();
    expect(screen.getByText(/AI 总结生成 Token/)).toBeInTheDocument();
    expect(screen.getByText(/input 10/)).toBeInTheDocument();
  });

  it('shows refresh failure and does not inject fallback guidance for a new position', async () => {
    ensureGenerationMemoryFresh.mockResolvedValue({
      refreshed: false,
      error: '未配置 AI API Key',
    });
    generateInterviewSummary.mockResolvedValue({
      data: {
        interview_info: {
          interviewer: 'Lewis',
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
      },
      usage: { input: 10, cached: 2, output: 20 },
    });

    render(<SummaryEditor position={position} candidate={candidate} autoGenerate />);

    await waitFor(() => {
      expect(generateInterviewSummary).toHaveBeenCalled();
    });

    expect(screen.getByText('岗位面评记忆刷新失败：未配置 AI API Key，继续使用当前指引。')).toBeInTheDocument();
    expect(generateInterviewSummary.mock.calls[0][8]).toBeUndefined();
  });

  it('marks summary memory dirty after a substantial rewrite even after autosave runs', async () => {
    vi.useFakeTimers();
    ensureGenerationMemoryFresh.mockResolvedValue({ refreshed: false });
    generateInterviewSummary.mockResolvedValue({
      data: {
        interview_info: {
          interviewer: 'Lewis',
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
      },
      usage: { input: 10, cached: 2, output: 20 },
    });
    analyzeInterviewSummaryRewrite.mockResolvedValue({
      data: {
        rewriteIntensity: 'high',
        preferences: ['结论更明确', '强调风险'],
      },
    });

    const view = render(<SummaryEditor position={position} candidate={candidate} autoGenerate />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(generateInterviewSummary).toHaveBeenCalled();

    const latestPosition = usePositionStore.getState().getPosition(position.id)!;
    const latestCandidate = latestPosition.candidates.find((item) => item.id === candidate.id)!;
    view.rerender(<SummaryEditor position={latestPosition} candidate={latestCandidate} autoGenerate />);

    fireEvent.change(screen.getByPlaceholderText('请输入对候选人的综合评价...'), {
      target: { value: 'Strong candidate with clear execution ownership, but delivery risk needs explicit follow-up.' },
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
      await Promise.resolve();
    });

    const updatedPosition = usePositionStore.getState().getPosition(position.id);
    expect(updatedPosition?.feedbackEvents?.some((event) => event.type === 'summary_rewritten')).toBe(true);
    expect(updatedPosition?.generationMemoryState?.dirtyScopes).toContain('summary_generation');

    vi.useRealTimers();
  }, 10000);

  it('shows pending summary memory event counts near the header when summary memory is dirty', async () => {
    usePositionStore.setState({
      ...usePositionStore.getState(),
      positions: [
        {
          ...position,
          candidates: [candidate],
          generationMemoryState: {
            dirtyScopes: ['summary_generation'],
            pendingQuestionEventCount: 0,
            pendingSummaryEventCount: 3,
            pendingQuestionCandidateCount: 0,
            pendingSummaryCandidateCount: 1,
          },
        },
      ],
      currentUserId: 'user-1',
    });

    render(
      <SummaryEditor
        position={{
          ...position,
          generationMemoryState: {
            dirtyScopes: ['summary_generation'],
            pendingQuestionEventCount: 0,
            pendingSummaryEventCount: 3,
            pendingQuestionCandidateCount: 0,
            pendingSummaryCandidateCount: 1,
          },
        }}
        candidate={candidate}
      />
    );

    expect(screen.getByText(/待合并事件 3，候选人 1/)).toBeInTheDocument();
  });
});
