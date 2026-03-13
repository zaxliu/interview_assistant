import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpcomingInterviews } from './UpcomingInterviews';
import { usePositionStore } from '@/store/positionStore';
import type { Candidate, Position } from '@/types';

describe('UpcomingInterviews', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T02:00:00.000Z'));
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows cancelled interviews in next 7 days', () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        title: '前端工程师',
        team: '平台',
        description: '',
        criteria: [],
        createdAt: '2026-03-10T00:00:00.000Z',
        source: 'manual',
        candidates: [
          {
            id: 'c-1',
            name: 'Alice',
            status: 'scheduled',
            interviewTime: '2026-03-13T03:00:00.000Z',
            questions: [],
          },
          {
            id: 'c-2',
            name: 'Bob',
            status: 'cancelled',
            interviewTime: '2026-03-14T06:00:00.000Z',
            questions: [],
          },
          {
            id: 'c-3',
            name: 'Carol',
            status: 'pending',
            interviewTime: '2026-03-15T06:00:00.000Z',
            questions: [],
          },
        ],
      },
    ];
    usePositionStore.setState({ positions });

    render(<UpcomingInterviews onStartInterview={() => undefined} />);

    expect(screen.getByText('未来 7 天面试')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('已取消')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('renders all upcoming interviews in the next 7 days without truncation', () => {
    const candidates: Candidate[] = Array.from({ length: 6 }, (_, idx) => {
      const status: Candidate['status'] = idx === 5 ? 'cancelled' : 'scheduled';
      return {
        id: `c-${idx + 1}`,
        name: `候选人${idx + 1}`,
        status,
        interviewTime: `2026-03-${String(idx + 13).padStart(2, '0')}T03:00:00.000Z`,
        questions: [],
      };
    });

    const positions: Position[] = [
      {
        id: 'position-2',
        title: '后端工程师',
        team: '基础架构',
        description: '',
        criteria: [],
        createdAt: '2026-03-10T00:00:00.000Z',
        source: 'manual',
        candidates,
      },
    ];
    usePositionStore.setState({ positions });

    render(<UpcomingInterviews onStartInterview={() => undefined} />);

    expect(screen.getByText('候选人1')).toBeInTheDocument();
    expect(screen.getByText('候选人6')).toBeInTheDocument();
  });
});
