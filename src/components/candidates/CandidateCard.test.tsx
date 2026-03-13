import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateCard } from './CandidateCard';
import type { Candidate } from '@/types';

describe('CandidateCard', () => {
  const isoFromNow = (daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString();
  };

  const buildCandidate = (overrides: Partial<Candidate>): Candidate => ({
    id: 'candidate-1',
    name: 'Alice',
    status: 'scheduled',
    questions: [],
    ...overrides,
  });

  it('shows quick-complete button for overdue active interviews and triggers complete only', async () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    const onComplete = vi.fn();

    render(
      <CandidateCard
        candidate={buildCandidate({ interviewTime: isoFromNow(-1) })}
        onClick={onClick}
        onEdit={onEdit}
        onComplete={onComplete}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '直接完成' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not show quick-complete button for future interviews or non-active status', () => {
    const sharedProps = {
      onClick: () => undefined,
      onEdit: () => undefined,
      onComplete: () => undefined,
    };

    const { rerender } = render(
      <CandidateCard
        candidate={buildCandidate({
          status: 'scheduled',
          interviewTime: isoFromNow(1),
        })}
        {...sharedProps}
      />
    );

    expect(screen.queryByRole('button', { name: '直接完成' })).not.toBeInTheDocument();

    rerender(
      <CandidateCard
        candidate={buildCandidate({
          status: 'completed',
          interviewTime: isoFromNow(-1),
        })}
        {...sharedProps}
      />
    );

    expect(screen.queryByRole('button', { name: '直接完成' })).not.toBeInTheDocument();
  });
});
