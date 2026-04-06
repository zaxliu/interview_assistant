import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSync } from './CalendarSync';
import { useSettingsStore } from '@/store/settingsStore';
import { usePositionStore } from '@/store/positionStore';
import type { Position } from '@/types';

const {
  syncCalendarMock,
  extractLinksFromDescriptionMock,
  fetchFirstAvailableWintalentPositionJDMock,
  buildPositionDescriptionFromWintalentJDMock,
  hookState,
} = vi.hoisted(() => ({
  syncCalendarMock: vi.fn(),
  extractLinksFromDescriptionMock: vi.fn(() => ({
    interviewLink: undefined,
    candidateLink: undefined,
  })),
  fetchFirstAvailableWintalentPositionJDMock: vi.fn(),
  buildPositionDescriptionFromWintalentJDMock: vi.fn(),
  hookState: {
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock('@/hooks/useFeishuCalendar', () => ({
  useFeishuCalendar: () => ({
    isLoading: hookState.isLoading,
    error: hookState.error,
    syncCalendar: syncCalendarMock,
  }),
}));

vi.mock('@/api/feishu', () => ({
  extractLinksFromDescription: extractLinksFromDescriptionMock,
}));

vi.mock('@/api/wintalent', () => ({
  fetchFirstAvailableWintalentPositionJD: fetchFirstAvailableWintalentPositionJDMock,
  buildPositionDescriptionFromWintalentJD: buildPositionDescriptionFromWintalentJDMock,
  isWintalentInterviewLink: (url: string | undefined) => Boolean(url && url.includes('wintalent.cn')),
}));

const emptySyncResult = {
  events: [],
  positions: new Map<string, { title: string; team: string }>(),
};

const setLoggedInUser = (loginTime: string) => {
  useSettingsStore.setState({
    feishuUserAccessToken: 'access-token',
    feishuUser: {
      id: 'user-1',
      name: 'Lewis',
      loginTime,
    },
  });
};

const getTodayKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('CalendarSync', () => {
  const isoFromNow = (daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    hookState.isLoading = false;
    hookState.error = null;
    syncCalendarMock.mockResolvedValue(emptySyncResult);
    fetchFirstAvailableWintalentPositionJDMock.mockResolvedValue({
      link: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
      jd: {
        postName: 'AI Agent应用工程师',
        workContent: '职责A',
        serviceCondition: '要求B',
      },
    });
    buildPositionDescriptionFromWintalentJDMock.mockReturnValue('自动拉取的JD内容');

    useSettingsStore.setState({ feishuUser: null });
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('calls sync with fixed window [-30, +30]', async () => {
    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledWith({ pastDays: 30, futureDays: 30 });
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

    syncCalendarMock.mockResolvedValue({
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
    const inWindow = updated?.candidates.find((candidate) => candidate.id === 'c-in-window');
    const outWindow = updated?.candidates.find((candidate) => candidate.id === 'c-out-window');
    const restored = updated?.candidates.find((candidate) => candidate.id === 'c-cancelled');
    const addedPast = updated?.candidates.find((candidate) => candidate.calendarEventId === 'evt-past-new');

    expect(inWindow?.status).toBe('cancelled');
    expect(outWindow?.status).toBe('scheduled');
    expect(restored?.status).toBe('scheduled');
    expect(addedPast?.name).toBe('李雷');
    expect(addedPast?.status).toBe('scheduled');
  });

  it('merges historical duplicated calendar positions and candidates on sync', async () => {
    const duplicatedInterviewTime = isoFromNow(2);
    usePositionStore.setState({
      positions: [
        {
          id: 'position-old',
          title: 'AI Agent应用工程师',
          team: undefined,
          description: '',
          criteria: [],
          createdAt: '2026-03-01T08:00:00.000Z',
          source: 'calendar',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alex',
              status: 'scheduled',
              calendarEventId: 'evt-old-1',
              interviewTime: duplicatedInterviewTime,
              questions: [],
            },
          ],
        },
        {
          id: 'position-dup',
          title: ' AI Agent应用工程师 ',
          team: '',
          description: '这是历史手工补充的JD内容',
          criteria: ['分布式系统设计'],
          createdAt: '2026-03-02T08:00:00.000Z',
          source: 'manual',
          candidates: [
            {
              id: 'candidate-2',
              name: 'Alex',
              status: 'scheduled',
              calendarEventId: 'evt-old-2',
              interviewTime: duplicatedInterviewTime,
              questions: [],
              quickNotes: '重复候选人',
            },
          ],
        },
      ],
      currentUserId: 'user-1',
    });

    syncCalendarMock.mockResolvedValue(emptySyncResult);

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });

    const mergedPositions = usePositionStore
      .getState()
      .positions.filter((position) => position.title.includes('AI Agent应用工程师'));

    expect(mergedPositions).toHaveLength(1);
    expect(mergedPositions[0].candidates).toHaveLength(1);
    expect(mergedPositions[0].candidates[0].name).toBe('Alex');
    expect(mergedPositions[0].description).toContain('JD内容');
    expect(mergedPositions[0].criteria).toContain('分布式系统设计');
  });

  it('dedupes mirrored calendar events and does not create duplicated candidates', async () => {
    const sharedTime = isoFromNow(1);
    syncCalendarMock.mockResolvedValue({
      events: [
        {
          eventId: 'evt-primary',
          title: '面试安排：李雷(AI Agent应用工程师)',
          startTime: sharedTime,
          endTime: sharedTime,
          parsedTitle: {
            candidateName: '李雷',
            team: '',
            position: 'AI Agent应用工程师',
          },
        },
        {
          eventId: 'evt-shared',
          title: '面试安排：李雷(AI Agent应用工程师)',
          startTime: sharedTime,
          endTime: sharedTime,
          parsedTitle: {
            candidateName: '李雷',
            team: '',
            position: 'AI Agent应用工程师',
          },
        },
      ],
      positions: new Map([['-AI Agent应用工程师', { title: 'AI Agent应用工程师', team: '' }]]),
    });

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      const position = usePositionStore
        .getState()
        .positions.find((item) => item.title === 'AI Agent应用工程师');
      expect(position?.candidates.length).toBe(1);
    });
  });

  it('auto syncs once on first home mount after login', async () => {
    const loginTime = '2026-03-13T01:00:00.000Z';
    setLoggedInUser(loginTime);

    render(<CalendarSync />);

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });

    expect(localStorage.getItem('interview-assistant-calendar-auto-sync-login-at:user-1')).toBe(loginTime);
    expect(localStorage.getItem('interview-assistant-calendar-auto-sync-date:user-1')).toBe(getTodayKey());
  });

  it('does not auto sync again on same login and same day', () => {
    const loginTime = '2026-03-13T01:00:00.000Z';
    setLoggedInUser(loginTime);
    localStorage.setItem('interview-assistant-calendar-auto-sync-login-at:user-1', loginTime);
    localStorage.setItem('interview-assistant-calendar-auto-sync-date:user-1', getTodayKey());

    render(<CalendarSync />);

    expect(syncCalendarMock).not.toHaveBeenCalled();
  });

  it('auto syncs when date marker is stale', async () => {
    const loginTime = '2026-03-13T01:00:00.000Z';
    setLoggedInUser(loginTime);
    localStorage.setItem('interview-assistant-calendar-auto-sync-login-at:user-1', loginTime);
    localStorage.setItem('interview-assistant-calendar-auto-sync-date:user-1', '2026-03-12');

    render(<CalendarSync />);

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });
  });

  it('auto syncs when login time changes even on same day', async () => {
    const loginTime = '2026-03-13T02:00:00.000Z';
    setLoggedInUser(loginTime);
    localStorage.setItem('interview-assistant-calendar-auto-sync-login-at:user-1', '2026-03-13T00:00:00.000Z');
    localStorage.setItem('interview-assistant-calendar-auto-sync-date:user-1', getTodayKey());

    render(<CalendarSync />);

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows page error and does not persist success markers when auto sync fails', async () => {
    const loginTime = '2026-03-13T01:00:00.000Z';
    setLoggedInUser(loginTime);
    hookState.error = '同步日历失败';
    syncCalendarMock.mockResolvedValue(null);

    render(<CalendarSync />);

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('同步日历失败')).toBeInTheDocument();
    expect(localStorage.getItem('interview-assistant-calendar-auto-sync-login-at:user-1')).toBeNull();
    expect(localStorage.getItem('interview-assistant-calendar-auto-sync-date:user-1')).toBeNull();
  });

  it('keeps manual sync button working', async () => {
    useSettingsStore.setState({ feishuUser: null });

    render(<CalendarSync />);

    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(1);
    });
  });

  it('does not auto sync when token is missing even if user profile exists', () => {
    setLoggedInUser('2026-03-13T01:00:00.000Z');
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      feishuUserAccessToken: '',
    });

    render(<CalendarSync />);

    expect(syncCalendarMock).not.toHaveBeenCalled();
  });

  it('auto-fills empty calendar position description from wintalent link', async () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-jd',
          title: 'AI Agent应用工程师',
          team: '平台',
          description: '',
          criteria: [],
          createdAt: '2026-03-01T08:00:00.000Z',
          source: 'calendar',
          candidates: [
            {
              id: 'candidate-jd',
              name: 'Alex',
              status: 'scheduled',
              candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
              questions: [],
            },
          ],
        },
      ],
      currentUserId: 'user-1',
    });

    syncCalendarMock.mockResolvedValue(emptySyncResult);

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      const updated = usePositionStore.getState().getPosition('position-jd');
      expect(updated?.description).toBe('自动拉取的JD内容');
    });

    expect(fetchFirstAvailableWintalentPositionJDMock).toHaveBeenCalledWith([
      'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
    ]);
    expect(buildPositionDescriptionFromWintalentJDMock).toHaveBeenCalledTimes(1);
  });

  it('tries multiple candidate links when auto-filling JD', async () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-jd',
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
        },
      ],
      currentUserId: 'user-1',
    });

    fetchFirstAvailableWintalentPositionJDMock.mockResolvedValue({
      link: 'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
      jd: {
        postName: 'AI Agent应用工程师',
        workContent: '职责B',
      },
    });
    buildPositionDescriptionFromWintalentJDMock.mockReturnValue('候选人2的JD内容');
    syncCalendarMock.mockResolvedValue(emptySyncResult);

    render(<CalendarSync />);
    fireEvent.click(screen.getByRole('button', { name: '同步日历' }));

    await waitFor(() => {
      const updated = usePositionStore.getState().getPosition('position-jd');
      expect(updated?.description).toBe('候选人2的JD内容');
    });

    expect(fetchFirstAvailableWintalentPositionJDMock).toHaveBeenCalledWith([
      'https://www.wintalent.cn/wt/Horizon/kurl?k=first',
      'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
    ]);
  });

  it('does not retry JD autofill for the same failed wintalent links within the session', async () => {
    usePositionStore.setState({
      positions: [
        {
          id: 'position-jd',
          title: 'AI Agent应用工程师',
          team: '平台',
          description: '',
          criteria: [],
          createdAt: '2026-03-01T08:00:00.000Z',
          source: 'calendar',
          candidates: [
            {
              id: 'candidate-jd',
              name: 'Alex',
              status: 'scheduled',
              candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
              questions: [],
            },
          ],
        },
      ],
      currentUserId: 'user-1',
    });

    fetchFirstAvailableWintalentPositionJDMock.mockRejectedValue(new Error('Wintalent 链接可能已失效'));
    syncCalendarMock.mockResolvedValue(emptySyncResult);

    render(<CalendarSync />);
    const syncButton = screen.getByRole('button', { name: '同步日历' });

    fireEvent.click(syncButton);
    await waitFor(() => {
      expect(fetchFirstAvailableWintalentPositionJDMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(syncButton);
    await waitFor(() => {
      expect(syncCalendarMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchFirstAvailableWintalentPositionJDMock).toHaveBeenCalledTimes(1);
  });
});
