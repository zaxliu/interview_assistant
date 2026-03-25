import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFeishuCalendar } from '@/hooks/useFeishuCalendar';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui';
import { extractLinksFromDescription } from '@/api/feishu';
import {
  buildPositionDescriptionFromWintalentJD,
  fetchFirstAvailableWintalentPositionJD,
  isWintalentInterviewLink,
} from '@/api/wintalent';
import type { Candidate, CalendarEvent, Position } from '@/types';

interface CalendarSyncProps {
  onSyncComplete?: () => void;
}

const AUTO_SYNC_LOGIN_KEY_PREFIX = 'interview-assistant-calendar-auto-sync-login-at';
const AUTO_SYNC_DATE_KEY_PREFIX = 'interview-assistant-calendar-auto-sync-date';
const SYNC_WINDOW = { pastDays: 30, futureDays: 30 } as const;

const normalizeForKey = (value?: string): string =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const toMinuteKey = (time?: string): string => {
  if (!time) return '';
  const timestamp = new Date(time).getTime();
  if (Number.isNaN(timestamp)) return '';
  return String(Math.floor(timestamp / 60000));
};

const buildPositionKey = (title?: string, team?: string): string =>
  `${normalizeForKey(team)}|${normalizeForKey(title)}`;

const buildCandidateSemanticKey = (
  candidateName: string,
  interviewTime?: string,
  interviewLink?: string,
  candidateLink?: string
): string | null => {
  const minuteKey = toMinuteKey(interviewTime);
  if (!minuteKey) return null;
  return [
    normalizeForKey(candidateName),
    minuteKey,
    normalizeForKey(interviewLink),
    normalizeForKey(candidateLink),
  ].join('|');
};

const statusPriority: Record<Candidate['status'], number> = {
  completed: 5,
  in_progress: 4,
  scheduled: 3,
  pending: 2,
  cancelled: 1,
};

const choosePreferredCandidate = (a: Candidate, b: Candidate): Candidate => {
  const score = (candidate: Candidate): number => {
    let value = statusPriority[candidate.status] * 100;
    if (candidate.interviewResult) value += 1000;
    if (candidate.resumeText || candidate.resumeMarkdown) value += 50;
    if (candidate.quickNotes) value += 40;
    if (candidate.calendarEventId) value += 20;
    value += candidate.questions.length * 2;
    value += candidate.codingChallenges?.length || 0;
    return value;
  };
  return score(a) >= score(b) ? a : b;
};

const mergeCandidateGroup = (candidates: Candidate[]): Candidate => {
  const preferred = candidates.reduce((best, current) => choosePreferredCandidate(best, current));
  const mergedQuestions = new Map<string, Candidate['questions'][number]>();
  const mergedChallenges = new Map<string, NonNullable<Candidate['codingChallenges']>[number]>();

  candidates.forEach((candidate) => {
    candidate.questions.forEach((question) => {
      if (!mergedQuestions.has(question.id)) {
        mergedQuestions.set(question.id, question);
      }
    });
    candidate.codingChallenges?.forEach((challenge) => {
      if (!mergedChallenges.has(challenge.id)) {
        mergedChallenges.set(challenge.id, challenge);
      }
    });
  });

  const mergedStatus = candidates.reduce(
    (current, candidate) =>
      statusPriority[candidate.status] > statusPriority[current] ? candidate.status : current,
    preferred.status
  );

  return {
    ...preferred,
    status: mergedStatus,
    calendarEventId: preferred.calendarEventId || candidates.find((candidate) => candidate.calendarEventId)?.calendarEventId,
    interviewTime: preferred.interviewTime || candidates.find((candidate) => candidate.interviewTime)?.interviewTime,
    interviewLink: preferred.interviewLink || candidates.find((candidate) => candidate.interviewLink)?.interviewLink,
    candidateLink: preferred.candidateLink || candidates.find((candidate) => candidate.candidateLink)?.candidateLink,
    resumeText: preferred.resumeText || candidates.find((candidate) => candidate.resumeText)?.resumeText,
    resumeRawText: preferred.resumeRawText || candidates.find((candidate) => candidate.resumeRawText)?.resumeRawText,
    resumeMarkdown: preferred.resumeMarkdown || candidates.find((candidate) => candidate.resumeMarkdown)?.resumeMarkdown,
    resumeHighlights: preferred.resumeHighlights || candidates.find((candidate) => candidate.resumeHighlights)?.resumeHighlights,
    resumeFilename: preferred.resumeFilename || candidates.find((candidate) => candidate.resumeFilename)?.resumeFilename,
    resumeUrl: preferred.resumeUrl || candidates.find((candidate) => candidate.resumeUrl)?.resumeUrl,
    quickNotes: preferred.quickNotes || candidates.find((candidate) => candidate.quickNotes)?.quickNotes,
    interviewResult: preferred.interviewResult || candidates.find((candidate) => candidate.interviewResult)?.interviewResult,
    questions: Array.from(mergedQuestions.values()),
    codingChallenges: mergedChallenges.size > 0 ? Array.from(mergedChallenges.values()) : preferred.codingChallenges,
  };
};

const mergeDuplicateCandidates = (candidates: Candidate[]): { candidates: Candidate[]; changed: boolean } => {
  const buckets = new Map<string, Candidate[]>();
  candidates.forEach((candidate) => {
    const semanticKey = buildCandidateSemanticKey(
      candidate.name,
      candidate.interviewTime,
      candidate.interviewLink,
      candidate.candidateLink
    );
    const bucketKey = semanticKey || (candidate.calendarEventId ? `event:${candidate.calendarEventId}` : `id:${candidate.id}`);
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.push(candidate);
    } else {
      buckets.set(bucketKey, [candidate]);
    }
  });

  const merged = Array.from(buckets.values()).map((group) =>
    group.length === 1 ? group[0] : mergeCandidateGroup(group)
  );

  return {
    candidates: merged,
    changed: merged.length !== candidates.length,
  };
};

const mergeDuplicatePositions = (positions: Position[]): { positions: Position[]; changed: boolean } => {
  const groups = new Map<string, Position[]>();
  positions.forEach((position) => {
    const key = buildPositionKey(position.title, position.team);
    const group = groups.get(key);
    if (group) {
      group.push(position);
    } else {
      groups.set(key, [position]);
    }
  });

  const positionScore = (position: Position): number => {
    let score = position.candidates.length * 20;
    score += position.criteria.length * 5;
    score += Math.min((position.description || '').trim().length, 200) / 10;
    if (position.source === 'calendar') score += 10;
    return score;
  };

  let changed = false;
  const mergedPositions = Array.from(groups.values()).map((group) => {
    if (group.length > 1) {
      changed = true;
    }

    const preferred = group.reduce((best, current) =>
      positionScore(current) > positionScore(best) ? current : best
    );
    const allCandidates = group.flatMap((position) => position.candidates);
    const mergedCandidates = mergeDuplicateCandidates(allCandidates);
    if (mergedCandidates.changed) {
      changed = true;
    }

    const criteriaSet = new Set<string>();
    group.forEach((position) => {
      position.criteria.forEach((criterion) => criteriaSet.add(criterion));
    });

    const description = group.reduce((longest, position) => {
      const current = (position.description || '').trim();
      return current.length > longest.length ? current : longest;
    }, '');
    const team =
      group
        .map((position) => (position.team || '').trim())
        .find((value) => value.length > 0) ||
      preferred.team ||
      '';

    return {
      ...preferred,
      title: preferred.title.trim(),
      team,
      description,
      criteria: Array.from(criteriaSet),
      candidates: mergedCandidates.candidates,
      source: group.some((position) => position.source === 'calendar') ? 'calendar' : preferred.source,
    };
  });

  return { positions: mergedPositions, changed };
};

const dedupeIncomingEvents = (
  events: CalendarEvent[],
  existingEventIds: Set<string>
): CalendarEvent[] => {
  const deduped = new Map<string, CalendarEvent>();

  events.forEach((event) => {
    if (!event.parsedTitle) return;
    const key = [
      buildPositionKey(event.parsedTitle.position, event.parsedTitle.team),
      normalizeForKey(event.parsedTitle.candidateName),
      toMinuteKey(event.startTime),
    ].join('|');
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, event);
      return;
    }

    const currentKnown = existingEventIds.has(current.eventId);
    const nextKnown = existingEventIds.has(event.eventId);
    if (nextKnown && !currentKnown) {
      deduped.set(key, event);
      return;
    }
    if (currentKnown && !nextKnown) {
      return;
    }

    const currentScore = Number(Boolean(current.meetLink)) + Number(Boolean(current.description));
    const nextScore = Number(Boolean(event.meetLink)) + Number(Boolean(event.description));
    if (nextScore > currentScore) {
      deduped.set(key, event);
    }
  });

  return Array.from(deduped.values());
};

const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const CalendarSync: React.FC<CalendarSyncProps> = ({ onSyncComplete }) => {
  const { isLoading, error, syncCalendar } = useFeishuCalendar();
  const { addPosition, addCandidate, updateCandidate, updatePosition } = usePositionStore();
  const feishuUser = useSettingsStore((state) => state.feishuUser);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSyncAttempted = useRef(new Set<string>());

  const mergeAndPersistDuplicates = useCallback(() => {
    const currentPositions = usePositionStore.getState().positions;
    const merged = mergeDuplicatePositions(currentPositions);
    if (!merged.changed) {
      return;
    }
    usePositionStore.setState({ positions: merged.positions });
    usePositionStore.getState().saveToStorage();
  }, []);

  const autoFillPositionDescriptionsFromWintalent = useCallback(async () => {
    const currentPositions = usePositionStore.getState().positions;
    const descriptionCache = new Map<string, string>();

    for (const position of currentPositions) {
      if (position.source !== 'calendar') continue;
      if ((position.description || '').trim()) continue;

      const candidateLinks = position.candidates
        .map((candidate) => candidate.candidateLink?.trim() || '')
        .filter((link) => isWintalentInterviewLink(link));

      if (candidateLinks.length === 0) continue;

      try {
        const cacheKey = candidateLinks.join('|');
        let nextDescription = descriptionCache.get(cacheKey);
        if (!nextDescription) {
          const { jd } = await fetchFirstAvailableWintalentPositionJD(candidateLinks);
          nextDescription = buildPositionDescriptionFromWintalentJD(jd);
          if (!nextDescription) continue;
          descriptionCache.set(cacheKey, nextDescription);
        }

        updatePosition(position.id, { description: nextDescription });
      } catch (err) {
        console.warn('[CalendarSync] Auto-fill position JD failed:', position.id, err);
      }
    }
  }, [updatePosition]);

  const runSync = useCallback(async (): Promise<boolean> => {
    mergeAndPersistDuplicates();

    const result = await syncCalendar(SYNC_WINDOW);
    if (!result) {
      return false;
    }

    const rawEvents = result.events.filter((event) => event.parsedTitle);
    const syncedEventIds = new Set(rawEvents.map((event) => event.eventId));
    const existingEventIds = new Set(
      usePositionStore
        .getState()
        .positions
        .flatMap((position) =>
          position.candidates
            .map((candidate) => candidate.calendarEventId)
            .filter((value): value is string => Boolean(value))
        )
    );
    const events = dedupeIncomingEvents(rawEvents, existingEventIds);
    const now = new Date();
    const windowStart = new Date(now);
    const windowEnd = new Date(now);
    windowStart.setDate(windowStart.getDate() - SYNC_WINDOW.pastDays);
    windowEnd.setDate(windowEnd.getDate() + SYNC_WINDOW.futureDays);

    const positionIdsByKey = new Map<string, string>();
    usePositionStore.getState().positions.forEach((position) => {
      positionIdsByKey.set(buildPositionKey(position.title, position.team), position.id);
    });

    const positionEventGroups = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      if (!event.parsedTitle) return;
      const key = buildPositionKey(event.parsedTitle.position, event.parsedTitle.team);
      const group = positionEventGroups.get(key);
      if (group) {
        group.push(event);
      } else {
        positionEventGroups.set(key, [event]);
      }
    });

    positionEventGroups.forEach((groupEvents, positionKey) => {
      const parsedTitle = groupEvents[0].parsedTitle;
      if (!parsedTitle) return;

      let positionId = positionIdsByKey.get(positionKey);
      if (!positionId) {
        const newPosition = addPosition({
          title: parsedTitle.position,
          team: parsedTitle.team,
          description: '',
          criteria: [],
          source: 'calendar',
        });
        positionId = newPosition.id;
        positionIdsByKey.set(positionKey, positionId);
      }

      groupEvents.forEach((event) => {
        if (!event.parsedTitle || !positionId) return;

        const extractedLinks = extractLinksFromDescription(event.description);
        const interviewLink = event.meetLink || extractedLinks.interviewLink;
        const candidateLink = extractedLinks.candidateLink;

        const position = usePositionStore.getState().getPosition(positionId);
        const existingByEventId = position?.candidates.find(
          (candidate) => candidate.calendarEventId === event.eventId
        );
        const eventSemanticKey = buildCandidateSemanticKey(
          event.parsedTitle.candidateName,
          event.startTime,
          interviewLink,
          candidateLink
        );
        const existingBySemantic = eventSemanticKey
          ? position?.candidates.find((candidate) => {
              const candidateSemanticKey = buildCandidateSemanticKey(
                candidate.name,
                candidate.interviewTime,
                candidate.interviewLink,
                candidate.candidateLink
              );
              return candidateSemanticKey === eventSemanticKey;
            })
          : undefined;
        const existingCandidate = existingByEventId || existingBySemantic;

        if (!existingCandidate) {
          addCandidate(positionId, {
            name: event.parsedTitle.candidateName,
            status: 'scheduled',
            calendarEventId: event.eventId,
            interviewTime: event.startTime,
            interviewLink,
            candidateLink,
          });
          return;
        }

        updateCandidate(positionId, existingCandidate.id, {
          interviewTime: event.startTime,
          calendarEventId: existingCandidate.calendarEventId || event.eventId,
          interviewLink: interviewLink || existingCandidate.interviewLink,
          candidateLink: candidateLink || existingCandidate.candidateLink,
          ...(existingCandidate.status === 'cancelled' ? { status: 'scheduled' } : {}),
        });
      });
    });

    // Mark candidates as cancelled if their calendar event was deleted.
    usePositionStore.getState().positions.forEach((position) => {
      position.candidates.forEach((candidate) => {
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
          updateCandidate(position.id, candidate.id, { status: 'cancelled' });
        }
      });
    });

    mergeAndPersistDuplicates();
    await autoFillPositionDescriptionsFromWintalent();
    setLastSyncTime(new Date());
    onSyncComplete?.();
    return true;
  }, [
    syncCalendar,
    addPosition,
    addCandidate,
    updateCandidate,
    onSyncComplete,
    mergeAndPersistDuplicates,
    autoFillPositionDescriptionsFromWintalent,
  ]);

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
