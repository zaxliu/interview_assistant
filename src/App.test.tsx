import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';

vi.mock('@/pages/DashboardPage', () => ({
  default: () => <div>dashboard</div>,
}));

vi.mock('@/pages/PositionFormPage', () => ({
  default: () => <div>position-form</div>,
}));

vi.mock('@/pages/PositionDetailPage', () => ({
  default: () => <div>position-detail</div>,
}));

vi.mock('@/pages/CandidateFormPage', () => ({
  default: () => <div>candidate-form</div>,
}));

vi.mock('@/pages/InterviewPage', () => ({
  default: () => <div>interview-page</div>,
}));

vi.mock('@/pages/SummaryPage', () => ({
  default: () => <div>summary-page</div>,
}));

vi.mock('@/pages/SettingsPage', () => ({
  default: () => <div>settings-page</div>,
}));

vi.mock('@/pages/UsageAdminPage', () => ({
  default: () => <div>usage-admin</div>,
}));

vi.mock('@/hooks/useTokenValidation', () => ({
  useTokenValidation: vi.fn(),
}));

vi.mock('@/hooks/useFeishuOAuth', () => ({
  useFeishuOAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock('@/utils/migration', () => ({
  migrateLegacyData: vi.fn(() => false),
}));

vi.mock('@/components/auth/UserLoginBanner', () => ({
  UserLoginBanner: () => <div>login-banner</div>,
}));

vi.mock('@/components/calendar/CalendarSync', () => ({
  CalendarSync: () => <div>calendar-sync</div>,
}));

describe('App header summary action', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      feishuUser: { id: 'user-1', name: 'Lewis', loginTime: '2026-04-06T00:00:00.000Z' },
    });
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Frontend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          userId: 'user-1',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alice',
              status: 'in_progress',
              questions: [],
              userId: 'user-1',
            },
          ],
        },
      ],
      currentUserId: 'user-1',
    });
  });

  it('shows the summary button when interview questions appear after initial render', async () => {
    render(
      <MemoryRouter initialEntries={['/positions/position-1/candidates/candidate-1/interview']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: '生成总结' })).not.toBeInTheDocument();

    act(() => {
      usePositionStore.setState({
        positions: [
          {
            id: 'position-1',
            title: 'Frontend Engineer',
            criteria: [],
            createdAt: '2026-04-06T00:00:00.000Z',
            source: 'manual',
            userId: 'user-1',
            candidates: [
              {
                id: 'candidate-1',
                name: 'Alice',
                status: 'in_progress',
                userId: 'user-1',
                questions: [
                  {
                    id: 'q-1',
                    text: '介绍一个最复杂的前端性能问题',
                    source: 'common',
                    isAIGenerated: true,
                    status: 'asked',
                  },
                ],
              },
            ],
          },
        ],
        currentUserId: 'user-1',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成总结' })).toBeInTheDocument();
    });
  });
});
