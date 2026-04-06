import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PositionDetailPage from './PositionDetailPage';
import { usePositionStore } from '@/store/positionStore';

const navigate = vi.fn();
const refreshGenerationMemory = vi.fn();

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

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    refreshGenerationMemory,
  }),
}));

describe('PositionDetailPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('shows latest position memory, refresh status, and manual refresh action on position page', async () => {
    refreshGenerationMemory.mockResolvedValue({
      refreshedScopes: ['question_generation', 'summary_generation'],
      usageByScope: {
        question_generation: { input: 31, cached: 3, output: 12 },
        summary_generation: { input: 18, cached: 0, output: 9 },
      },
    });
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationMemory: {
            questionMemoryItems: [],
            summaryMemoryItems: [],
            questionGuidancePrompt: '优先深挖系统设计取舍',
            summaryGuidancePrompt: '面评先写证据再下结论',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
            version: 1,
          },
          generationMemoryState: {
            dirtyScopes: ['question_generation'],
            pendingQuestionEventCount: 3,
            pendingSummaryEventCount: 0,
            pendingQuestionCandidateCount: 2,
            pendingSummaryCandidateCount: 0,
            lastQuestionRefreshUsage: { input: 21, cached: 1, output: 8 },
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    expect(screen.getByText('AI 指引（岗位记忆）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新岗位记忆' })).toBeInTheDocument();
    expect(screen.queryByLabelText('问题记忆指引')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('面评记忆指引')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开问题记忆指引' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开面评记忆指引' })).toBeInTheDocument();
    expect(screen.queryByText('当前生成逻辑')).not.toBeInTheDocument();
    expect(screen.getByText(/等待下次刷新/)).toBeInTheDocument();
    expect(screen.getByText(/待合并事件 3，候选人 2/)).toBeInTheDocument();
    expect(screen.queryByText(/问题记忆更新 Token/)).not.toBeInTheDocument();
    expect(screen.queryByText(/面评记忆更新 Token/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新岗位记忆' }));

    await waitFor(() => {
      expect(refreshGenerationMemory).toHaveBeenCalledWith('position-1');
    });

    expect(screen.getByText(/问题记忆更新 Token/)).toBeInTheDocument();
    expect(screen.getByText(/面评记忆更新 Token/)).toBeInTheDocument();
  });

  it('allows editing and saving guidance prompts on the position page', async () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationMemory: {
            questionMemoryItems: [],
            summaryMemoryItems: [],
            questionGuidancePrompt: '旧问题指引',
            summaryGuidancePrompt: '旧面评指引',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
            version: 1,
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '展开问题记忆指引' }));
    fireEvent.change(screen.getByLabelText('问题记忆指引'), {
      target: { value: '新的问题指引' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存问题指引' }));

    fireEvent.click(screen.getByRole('button', { name: '展开面评记忆指引' }));
    fireEvent.change(screen.getByLabelText('面评记忆指引'), {
      target: { value: '新的面评指引' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存面评指引' }));

    await waitFor(() => {
      const position = usePositionStore.getState().getPosition('position-1');
      expect(position?.generationMemory?.questionGuidancePrompt).toBe('新的问题指引');
      expect(position?.generationMemory?.summaryGuidancePrompt).toBe('新的面评指引');
    });
  });

  it('renders both guidance editors with the same panel style and auto-resize textarea behavior', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationMemory: {
            questionMemoryItems: [],
            summaryMemoryItems: [],
            questionGuidancePrompt: '第一行\n第二行',
            summaryGuidancePrompt: '甲\n乙',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
            version: 1,
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    fireEvent.click(screen.getByRole('button', { name: '展开问题记忆指引' }));
    fireEvent.click(screen.getByRole('button', { name: '展开面评记忆指引' }));
    const questionTextarea = screen.getByLabelText('问题记忆指引');
    const summaryTextarea = screen.getByLabelText('面评记忆指引');

    expect(questionTextarea.className).toContain('resize-none');
    expect(summaryTextarea.className).toContain('resize-none');
    expect(questionTextarea.className).toContain('border-slate-200');
    expect(summaryTextarea.className).toContain('border-slate-200');
    expect(questionTextarea.className).toContain('text-slate-700');
    expect(summaryTextarea.className).toContain('text-slate-700');
    expect(questionTextarea).toHaveAttribute('rows', '2');
    expect(summaryTextarea).toHaveAttribute('rows', '2');
  });

  it('keeps question guidance collapsed by default and expands on demand', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationMemory: {
            questionMemoryItems: [],
            summaryMemoryItems: [],
            questionGuidancePrompt: '旧问题指引',
            summaryGuidancePrompt: '旧面评指引',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
            version: 1,
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    expect(screen.queryByLabelText('问题记忆指引')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开问题记忆指引' }));
    expect(screen.getByLabelText('问题记忆指引')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起问题记忆指引' }));
    expect(screen.queryByLabelText('问题记忆指引')).not.toBeInTheDocument();
  });

  it('keeps summary guidance collapsed by default and expands on demand', () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-1',
          title: 'Backend Engineer',
          criteria: [],
          createdAt: '2026-04-06T00:00:00.000Z',
          source: 'manual',
          candidates: [],
          generationMemory: {
            questionMemoryItems: [],
            summaryMemoryItems: [],
            questionGuidancePrompt: '旧问题指引',
            summaryGuidancePrompt: '旧面评指引',
            updatedAt: '2026-04-06T09:00:00.000Z',
            sampleSize: 5,
            version: 1,
          },
        },
      ],
    });

    render(<PositionDetailPage />);

    expect(screen.queryByLabelText('面评记忆指引')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开面评记忆指引' }));
    expect(screen.getByLabelText('面评记忆指引')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起面评记忆指引' }));
    expect(screen.queryByLabelText('面评记忆指引')).not.toBeInTheDocument();
  });
});
