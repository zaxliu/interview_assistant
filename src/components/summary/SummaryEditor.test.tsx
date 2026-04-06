import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryEditor } from './SummaryEditor';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';

const { generateInterviewSummary, autofillWintalentEvaluationDraft } = vi.hoisted(() => ({
  generateInterviewSummary: vi.fn(),
  autofillWintalentEvaluationDraft: vi.fn(),
}));

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    error: null,
    generateInterviewSummary,
    analyzeInterviewSummaryRewrite: vi.fn(),
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

    await waitFor(() => {
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
    expect(screen.getByText(/AI 总结生成 Token/)).toBeInTheDocument();
    expect(screen.getByText(/input 10/)).toBeInTheDocument();
  });
});
