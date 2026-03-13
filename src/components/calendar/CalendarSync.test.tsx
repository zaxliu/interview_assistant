import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSync } from './CalendarSync';
import { useSettingsStore } from '@/store/settingsStore';
import { usePositionStore } from '@/store/positionStore';

const syncCalendarMock = vi.fn();
const hookState: { isLoading: boolean; error: string | null } = {
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/useFeishuCalendar', () => ({
  useFeishuCalendar: () => ({
    isLoading: hookState.isLoading,
    error: hookState.error,
    syncCalendar: syncCalendarMock,
  }),
}));

const emptySyncResult = {
  events: [],
  positions: new Map<string, { title: string; team: string }>(),
};

const setLoggedInUser = (loginTime: string) => {
  useSettingsStore.setState({
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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    hookState.isLoading = false;
    hookState.error = null;
    syncCalendarMock.mockResolvedValue(emptySyncResult);

    useSettingsStore.setState({ feishuUser: null });
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
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
});
