import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFeishuCalendar } from '@/hooks/useFeishuCalendar';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui';
import { extractLinksFromDescription } from '@/api/feishu';

interface CalendarSyncProps {
  onSyncComplete?: () => void;
}

const AUTO_SYNC_LOGIN_KEY_PREFIX = 'interview-assistant-calendar-auto-sync-login-at';
const AUTO_SYNC_DATE_KEY_PREFIX = 'interview-assistant-calendar-auto-sync-date';
const SYNC_WINDOW = { pastDays: 30, futureDays: 30 } as const;

const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const CalendarSync: React.FC<CalendarSyncProps> = ({ onSyncComplete }) => {
  const { isLoading, error, syncCalendar } = useFeishuCalendar();
  const { addPosition, addCandidate, updateCandidate, positions } = usePositionStore();
  const feishuUser = useSettingsStore((state) => state.feishuUser);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSyncAttempted = useRef(new Set<string>());

  const runSync = useCallback(async (): Promise<boolean> => {
    const result = await syncCalendar(SYNC_WINDOW);
    if (!result) {
      return false;
    }

    const { events, positions: positionMap } = result;
    const now = new Date();
    const windowStart = new Date(now);
    const windowEnd = new Date(now);
    windowStart.setDate(windowStart.getDate() - SYNC_WINDOW.pastDays);
    windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW.futureDays);

    // Collect all calendar event IDs from this sync
    const syncedEventIds = new Set(events.map((event) => event.eventId));

    // Create or update positions and candidates
    positionMap.forEach((posInfo, key) => {
      // Check if position already exists
      const existingPosition = positions.find(
        (position) => position.title === posInfo.title && position.team === posInfo.team
      );

      let positionId: string;

      if (!existingPosition) {
        const newPosition = addPosition({
          title: posInfo.title,
          team: posInfo.team,
          description: '',
          criteria: [],
          source: 'calendar',
        });
        positionId = newPosition.id;
      } else {
        positionId = existingPosition.id;
      }

      // Add or update candidates from events
      events.forEach((event) => {
        if (event.parsedTitle) {
          const eventKey = `${event.parsedTitle.team}-${event.parsedTitle.position}`;
          if (eventKey === key) {
            const extractedLinks = extractLinksFromDescription(event.description);
            const interviewLink = event.meetLink || extractedLinks.interviewLink;
            const candidateLink = extractedLinks.candidateLink;

            // Check if candidate already exists
            const pos = usePositionStore.getState().getPosition(positionId);
            const existingCandidate = pos?.candidates.find(
              (candidate) => candidate.calendarEventId === event.eventId
            );

            if (!existingCandidate) {
              // Add new candidate
              addCandidate(positionId, {
                name: event.parsedTitle.candidateName,
                status: 'scheduled',
                calendarEventId: event.eventId,
                interviewTime: event.startTime,
                interviewLink,
                candidateLink,
              });
            } else {
              // Update existing candidate's interview time (in case format changed)
              // Also restore status from cancelled if event is back
              updateCandidate(positionId, existingCandidate.id, {
                interviewTime: event.startTime,
                interviewLink: interviewLink || existingCandidate.interviewLink,
                candidateLink: candidateLink || existingCandidate.candidateLink,
                ...(existingCandidate.status === 'cancelled' ? { status: 'scheduled' } : {}),
              });
            }
          }
        }
      });

      // Mark candidates as cancelled if their calendar event was deleted
      const pos = usePositionStore.getState().getPosition(positionId);
      pos?.candidates.forEach((candidate) => {
        const interviewDate = candidate.interviewTime ? new Date(candidate.interviewTime) : null;
        const isInSyncWindow = Boolean(
          interviewDate &&
          !Number.isNaN(interviewDate.getTime()) &&
          interviewDate >= windowStart &&
          interviewDate <= windowEnd
        );

        if (
          candidate.calendarEventId &&
          isInSyncWindow &&
          !syncedEventIds.has(candidate.calendarEventId) &&
          candidate.status !== 'completed' &&
          candidate.status !== 'cancelled'
        ) {
          updateCandidate(positionId, candidate.id, { status: 'cancelled' });
        }
      });
    });

    setLastSyncTime(new Date());
    onSyncComplete?.();
    return true;
  }, [syncCalendar, positions, addPosition, addCandidate, updateCandidate, onSyncComplete]);

  const handleSync = useCallback(async () => {
    await runSync();
  }, [runSync]);

  useEffect(() => {
    if (!feishuUser?.id || !feishuUser.loginTime || isLoading) {
      return;
    }

    const userId = feishuUser.id;
    const today = toLocalDateKey(new Date());
    const loginSyncKey = `${AUTO_SYNC_LOGIN_KEY_PREFIX}:${userId}`;
    const dateSyncKey = `${AUTO_SYNC_DATE_KEY_PREFIX}:${userId}`;
    const needsLoginSync = localStorage.getItem(loginSyncKey) !== feishuUser.loginTime;
    const needsDailySync = localStorage.getItem(dateSyncKey) !== today;

    if (!needsLoginSync && !needsDailySync) {
      return;
    }

    const attemptKey = `${userId}|${feishuUser.loginTime}|${today}`;
    if (autoSyncAttempted.current.has(attemptKey)) {
      return;
    }
    autoSyncAttempted.current.add(attemptKey);

    void (async () => {
      const success = await runSync();
      if (!success) {
        return;
      }
      localStorage.setItem(loginSyncKey, feishuUser.loginTime);
      localStorage.setItem(dateSyncKey, today);
    })();
  }, [feishuUser?.id, feishuUser?.loginTime, isLoading, runSync]);

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleSync}
        isLoading={isLoading}
        size="sm"
        variant="secondary"
      >
        <svg
          className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        同步日历
      </Button>

      {lastSyncTime && (
        <span className="text-xs text-gray-500">
          上次同步：{lastSyncTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}

      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
};
