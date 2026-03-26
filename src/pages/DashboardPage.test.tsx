import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { usePositionStore } from '@/store/positionStore';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/components/calendar/UpcomingInterviews', () => ({
  UpcomingInterviews: ({ onStartInterview }: { onStartInterview: (positionId: string, candidateId: string) => void }) => (
    <div>
      <button type="button" onClick={() => onStartInterview('position-1', 'candidate-1')}>
        trigger-start
      </button>
    </div>
  ),
}));

vi.mock('@/components/positions/PositionList', () => ({
  PositionList: () => <div>positions</div>,
}));

vi.mock('@/components/settings/SettingsWarning', () => ({
  SettingsWarning: () => null,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('navigates directly to interview when candidate already has a resume', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Frontend Engineer',
          criteria: [],
          createdAt: '2026-03-10T00:00:00.000Z',
          source: 'manual',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alice',
              status: 'scheduled',
              questions: [],
              resumeText: 'Existing resume',
            },
          ],
        },
      ],
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-start' }));

    expect(navigate).toHaveBeenCalledWith('/positions/position-1/candidates/candidate-1/interview');
  });

  it('routes to edit page with autoImport when candidate has no resume and has Wintalent link', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Frontend Engineer',
          criteria: [],
          createdAt: '2026-03-10T00:00:00.000Z',
          source: 'manual',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alice',
              status: 'scheduled',
              questions: [],
              candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
            },
          ],
        },
      ],
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-start' }));

    expect(navigate).toHaveBeenCalledWith('/positions/position-1/candidates/candidate-1/edit?autoImport=1&from=start');
  });

  it('navigates directly to interview when candidate has no Wintalent link', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Frontend Engineer',
          criteria: [],
          createdAt: '2026-03-10T00:00:00.000Z',
          source: 'manual',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alice',
              status: 'scheduled',
              questions: [],
              candidateLink: 'https://example.com/candidate',
            },
          ],
        },
      ],
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-start' }));

    expect(navigate).toHaveBeenCalledWith('/positions/position-1/candidates/candidate-1/interview');
  });
});
