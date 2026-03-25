import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionForm } from './PositionForm';
import { usePositionStore } from '@/store/positionStore';

const { fetchFirstAvailableWintalentPositionJDMock, buildPositionDescriptionFromWintalentJDMock } = vi.hoisted(() => ({
  fetchFirstAvailableWintalentPositionJDMock: vi.fn(),
  buildPositionDescriptionFromWintalentJDMock: vi.fn(),
}));

vi.mock('@/api/wintalent', () => ({
  fetchFirstAvailableWintalentPositionJD: fetchFirstAvailableWintalentPositionJDMock,
  buildPositionDescriptionFromWintalentJD: buildPositionDescriptionFromWintalentJDMock,
  isWintalentInterviewLink: (url: string | undefined) => Boolean(url && url.includes('wintalent.cn')),
}));

describe('PositionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
    fetchFirstAvailableWintalentPositionJDMock.mockResolvedValue({
      link: 'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
      jd: {
        postName: 'AI Agent应用工程师',
        workContent: '职责B',
      },
    });
    buildPositionDescriptionFromWintalentJDMock.mockReturnValue('候选人2的JD内容');
  });

  it('tries multiple candidate links when refreshing JD', async () => {
    render(
      <PositionForm
        position={{
          id: 'position-1',
          title: 'AI Agent应用工程师',
          team: '平台',
          description: '',
          criteria: [],
          createdAt: '2026-03-01T08:00:00.000Z',
          source: 'calendar',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alex',
              status: 'scheduled',
              candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=first',
              questions: [],
            },
            {
              id: 'candidate-2',
              name: 'Bob',
              status: 'scheduled',
              candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
              questions: [],
            },
          ],
        }}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重新获取JD' }));

    await waitFor(() => {
      expect(fetchFirstAvailableWintalentPositionJDMock).toHaveBeenCalledWith([
        'https://www.wintalent.cn/wt/Horizon/kurl?k=first',
        'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
      ]);
      expect(screen.getByDisplayValue('候选人2的JD内容')).toBeInTheDocument();
      expect(screen.getByText('已获取最新 JD，请点击“保存修改”生效。')).toBeInTheDocument();
    });
  });
});
