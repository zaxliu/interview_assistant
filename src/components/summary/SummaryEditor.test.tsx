import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SummaryEditor } from './SummaryEditor';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';

const generateInterviewSummary = vi.fn();

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    error: null,
    generateInterviewSummary,
  }),
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
      undefined
    );
  });
});
