import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PositionDetailPage from './PositionDetailPage';
import { usePositionStore } from '@/store/positionStore';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ positionId: 'position-1' }),
  };
});

vi.mock('@/components/candidates/CandidateList', () => ({
  CandidateList: () => <div>candidate-list</div>,
}));

describe('PositionDetailPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('shows latest question/summary guidance and generation logic on position page', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationGuidance: {
            questionGuidance: '【岗位历史反馈指引-问题】\n优先覆盖维度\n- 专业能力（3）',
            summaryGuidance: '【岗位历史反馈指引-面评】\n面评常见改写偏好\n- 强调证据链（2）',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    expect(screen.getByText('AI 指引（闭环更新）')).toBeInTheDocument();
    expect(screen.getByText('问题 Guidance')).toBeInTheDocument();
    expect(screen.getByText('面评 Guidance')).toBeInTheDocument();
    expect(screen.getAllByText(/优先覆盖维度/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/面评常见改写偏好/).length).toBeGreaterThan(0);
    expect(screen.getByText('当前生成逻辑')).toBeInTheDocument();
    expect(screen.getByText('当前生成格式')).toBeInTheDocument();
  });
});
