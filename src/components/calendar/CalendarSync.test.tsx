import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSync } from './CalendarSync';
import { usePositionStore } from '@/store/positionStore';
import type { Position } from '@/types';

const { syncCalendar, extractLinksFromDescription } = vi.hoisted(() => ({
  syncCalendar: vi.fn(),
  extractLinksFromDescription: vi.fn(() => ({
    interviewLink: undefined,
    candidateLink: undefined,
  })),
}));

vi.mock('@/hooks/useFeishuCalendar', () => ({
  useFeishuCalendar: () => ({
    isLoading: false,
    error: null,
    syncCalendar,
  }),
}));

vi.mock('@/api/feishu', () => ({
  extractLinksFromDescription,
}));

describe('CalendarSync', () => {
  const isoFromNow = (daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString();
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('calls sync with fixed window [-30, +30]', async () => {
    syncCalendar.mockResolvedValue({ events: [], positions: new Map() });

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      expect(syncCalendar).toHaveBeenCalledWith({ pastDays: 30, futureDays: 30 });
    });
  });

  it('adds recent past events and only auto-cancels candidates inside sync window', async () => {
    const positions: Position[] = [
      {
        id: 'position-1',
        title: '前端工程师',
        team: '平台',
        description: '',
        criteria: [],
        createdAt: '2026-03-01T08:00:00.000Z',
        source: 'calendar',
        candidates: [
          {
            id: 'c-in-window',
            name: 'InWindow',
            status: 'scheduled',
            calendarEventId: 'evt-missing-in-window',
            interviewTime: isoFromNow(-1),
            questions: [],
          },
          {
            id: 'c-out-window',
            name: 'OutWindow',
            status: 'scheduled',
            calendarEventId: 'evt-missing-out-window',
            interviewTime: isoFromNow(-40),
            questions: [],
          },
          {
            id: 'c-cancelled',
            name: 'WasCancelled',
            status: 'cancelled',
            calendarEventId: 'evt-returned',
            interviewTime: isoFromNow(1),
            questions: [],
          },
        ],
      },
    ];
    usePositionStore.setState({ positions });

    const events = [
      {
        eventId: 'evt-returned',
        title: '面试安排：陈明(【平台】前端工程师)',
        startTime: isoFromNow(1),
        endTime: isoFromNow(1),
        parsedTitle: {
          candidateName: '陈明',
          team: '平台',
          position: '前端工程师',
        },
      },
      {
        eventId: 'evt-past-new',
        title: '面试安排：李雷(【平台】前端工程师)',
        startTime: isoFromNow(-3),
        endTime: isoFromNow(-3),
        parsedTitle: {
          candidateName: '李雷',
          team: '平台',
          position: '前端工程师',
        },
      },
    ];

    syncCalendar.mockResolvedValue({
      events,
      positions: new Map([['平台-前端工程师', { title: '前端工程师', team: '平台' }]]),
    });

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      const updated = usePositionStore.getState().getPosition('position-1');
      expect(updated?.candidates.length).toBe(4);
    });

    const updated = usePositionStore.getState().getPosition('position-1');
    const inWindow = updated?.candidates.find((c) => c.id === 'c-in-window');
    const outWindow = updated?.candidates.find((c) => c.id === 'c-out-window');
    const restored = updated?.candidates.find((c) => c.id === 'c-cancelled');
    const addedPast = updated?.candidates.find((c) => c.calendarEventId === 'evt-past-new');

    expect(inWindow?.status).toBe('cancelled');
    expect(outWindow?.status).toBe('scheduled');
    expect(restored?.status).toBe('scheduled');
    expect(addedPast?.name).toBe('李雷');
    expect(addedPast?.status).toBe('scheduled');
  });
});
