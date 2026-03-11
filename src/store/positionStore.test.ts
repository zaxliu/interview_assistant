import { beforeEach, describe, expect, it } from 'vitest';
import { usePositionStore } from './positionStore';

describe('positionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
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
});
