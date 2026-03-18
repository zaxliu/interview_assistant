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

  it('uses Shanghai calendar day for today vs upcoming grouping', () => {
    vi.setSystemTime(new Date('2026-03-12T00:30:00.000Z'));

    const positions: Position[] = [
      {
        id: 'position-3',
        title: '测试工程师',
        team: '质量',
        description: '',
        criteria: [],
        createdAt: '2026-03-10T00:00:00.000Z',
        source: 'manual',
        candidates: [
          {
            id: 'c-shanghai-tomorrow',
            name: '明天面试的候选人',
            status: 'scheduled',
            interviewTime: '2026-03-12T23:30:00.000Z',
            questions: [],
          },
        ],
      },
    ];

    usePositionStore.setState({ positions });
    render(<UpcomingInterviews onStartInterview={() => undefined} />);

    expect(screen.getByText('未来 7 天面试')).toBeInTheDocument();
    expect(screen.queryByText('今日面试')).not.toBeInTheDocument();
    expect(screen.getByText('明天面试的候选人')).toBeInTheDocument();
  });

  it('dedupes duplicated entries in today and upcoming lists', () => {
    const duplicatedTodayTime = '2026-03-12T03:00:00.000Z';
    const duplicatedFutureTime = '2026-03-13T03:00:00.000Z';

    const positions: Position[] = [
      {
        id: 'position-calendar',
        title: 'AI Agent应用工程师',
        team: '',
        description: '',
        criteria: [],
        createdAt: '2026-03-10T00:00:00.000Z',
        source: 'calendar',
        candidates: [
          {
            id: 'c-calendar-today',
            name: '重复今日候选人',
            status: 'scheduled',
            interviewTime: duplicatedTodayTime,
            questions: [],
            calendarEventId: 'event-1',
          },
          {
            id: 'c-calendar-upcoming',
            name: '重复未来候选人',
            status: 'scheduled',
            interviewTime: duplicatedFutureTime,
            questions: [],
            calendarEventId: 'event-2',
          },
        ],
      },
      {
        id: 'position-duplicate',
        title: ' AI Agent应用工程师 ',
        team: undefined,
        description: '',
        criteria: [],
        createdAt: '2026-03-11T00:00:00.000Z',
        source: 'manual',
        candidates: [
          {
            id: 'c-manual-today',
            name: '重复今日候选人',
            status: 'scheduled',
            interviewTime: duplicatedTodayTime,
            questions: [],
          },
          {
            id: 'c-manual-upcoming',
            name: '重复未来候选人',
            status: 'scheduled',
            interviewTime: duplicatedFutureTime,
            questions: [],
          },
        ],
      },
    ];

    usePositionStore.setState({ positions });
    render(<UpcomingInterviews onStartInterview={() => undefined} />);

    expect(screen.getAllByText('重复今日候选人')).toHaveLength(1);
    expect(screen.getAllByText('重复未来候选人')).toHaveLength(1);
  });
});
