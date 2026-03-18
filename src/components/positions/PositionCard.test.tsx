import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionCard } from './PositionCard';
import type { Position } from '@/types';

const buildPosition = (candidateStatuses: Array<Position['candidates'][number]['status']>): Position => ({
  id: 'position-1',
  title: '前端工程师',
  team: '效率平台',
  description: '负责面试工具前端体验',
  criteria: [],
  createdAt: '2026-03-18T10:00:00.000Z',
  source: 'manual',
  candidates: candidateStatuses.map((status, index) => ({
    id: `candidate-${index}`,
    name: `候选人${index + 1}`,
    status,
    questions: [],
  })),
});

describe('PositionCard', () => {
  it('renders continuous progress summary including cancelled candidates', () => {
    render(
      <PositionCard
        position={buildPosition(['completed', 'completed', 'scheduled', 'cancelled'])}
        onClick={() => undefined}
        onEdit={() => undefined}
      />
    );

    expect(screen.getByLabelText('岗位面试进度')).toBeInTheDocument();
    expect(screen.getByText('2/3 完成')).toBeInTheDocument();
    expect(screen.getByText('1 进行中')).toBeInTheDocument();
    expect(screen.getByText('1 已取消')).toBeInTheDocument();
    expect(screen.getByText('4 位候选人')).toBeInTheDocument();
  });

  it('keeps edit action isolated from card click', () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();

    render(
      <PositionCard
        position={buildPosition(['scheduled'])}
        onClick={onClick}
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
