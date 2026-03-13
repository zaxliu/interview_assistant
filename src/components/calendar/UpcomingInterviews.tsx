import React from 'react';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardBody, Button } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';
import type { Candidate } from '@/types';

interface UpcomingInterviewsProps {
  onStartInterview: (positionId: string, candidateId: string) => void;
}

interface InterviewEntry {
  position: {
    id: string;
    title: string;
    source: 'calendar' | 'manual';
  };
  candidate: Candidate;
}

const normalizeForKey = (value?: string): string =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const toMinuteKey = (time?: string): string => {
  if (!time) return '';
  const timestamp = new Date(time).getTime();
  if (Number.isNaN(timestamp)) return '';
  return String(Math.floor(timestamp / 60000));
};

const entryScore = (entry: InterviewEntry): number => {
  const statusScore: Record<Candidate['status'], number> = {
    scheduled: 40,
    in_progress: 40,
    cancelled: 10,
    completed: 0,
    pending: 0,
  };

  let score = statusScore[entry.candidate.status];
  if (entry.position.source === 'calendar') score += 20;
  if (entry.candidate.calendarEventId) score += 10;
  if (entry.candidate.interviewLink) score += 5;
  if (entry.candidate.interviewResult) score += 30;
  score += entry.candidate.questions.length;
  return score;
};

const dedupeInterviewEntries = (entries: InterviewEntry[]): InterviewEntry[] => {
  const merged = new Map<string, InterviewEntry>();

  entries.forEach((entry) => {
    const candidate = entry.candidate;
    const semanticKey = [
      normalizeForKey(entry.position.title),
      normalizeForKey(candidate.name),
      toMinuteKey(candidate.interviewTime),
    ].join('|');
    const fallbackKey = candidate.calendarEventId
      ? `event:${candidate.calendarEventId}`
      : `${entry.position.id}:${candidate.id}`;
    const key = toMinuteKey(candidate.interviewTime) ? semanticKey : fallbackKey;

    const existing = merged.get(key);
    if (!existing || entryScore(entry) > entryScore(existing)) {
      merged.set(key, entry);
    }
  });

  return Array.from(merged.values());
};

export const UpcomingInterviews: React.FC<UpcomingInterviewsProps> = ({
  onStartInterview,
}) => {
  const { positions } = usePositionStore();
  const dashboardStatuses: Candidate['status'][] = ['scheduled', 'in_progress', 'cancelled'];
  const statusColors: Record<Candidate['status'], string> = {
    pending: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  // Get today's interviews
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayInterviews = dedupeInterviewEntries(
    positions.flatMap((position) =>
      position.candidates
        .filter((candidate) => {
          if (!candidate.interviewTime || !dashboardStatuses.includes(candidate.status)) return false;
          const interviewDate = new Date(candidate.interviewTime);
          return interviewDate >= today && interviewDate < tomorrow;
        })
        .map((candidate): InterviewEntry => ({
          position: {
            id: position.id,
            title: position.title,
            source: position.source,
          },
          candidate,
        }))
    )
  )
    .sort(
      (a, b) =>
        new Date(a.candidate.interviewTime!).getTime() - new Date(b.candidate.interviewTime!).getTime()
    );

  // Get upcoming interviews (next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingInterviews = dedupeInterviewEntries(
    positions.flatMap((position) =>
      position.candidates
        .filter((candidate) => {
          if (!candidate.interviewTime || !dashboardStatuses.includes(candidate.status)) return false;
          const interviewDate = new Date(candidate.interviewTime);
          return interviewDate >= tomorrow && interviewDate < nextWeek;
        })
        .map((candidate): InterviewEntry => ({
          position: {
            id: position.id,
            title: position.title,
            source: position.source,
          },
          candidate,
        }))
    )
  )
    .sort(
      (a, b) =>
        new Date(a.candidate.interviewTime!).getTime() - new Date(b.candidate.interviewTime!).getTime()
    );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'short',
      day: 'numeric',
    });
  };

  if (todayInterviews.length === 0 && upcomingInterviews.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Today's Interviews */}
      {todayInterviews.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">今日面试</h3>
          <div className="space-y-2">
            {todayInterviews.map(({ position, candidate }) => (
              <Card key={candidate.id}>
                <CardBody className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-blue-600">
                      {formatTime(candidate.interviewTime!)}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {candidate.name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        | {position.title}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[candidate.status]}`}>
                      {t.candidateStatus[candidate.status]}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={candidate.status === 'cancelled' ? 'secondary' : 'primary'}
                    onClick={() => onStartInterview(position.id, candidate.id)}
                  >
                    {candidate.status === 'cancelled' ? t.common.view : t.common.start}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Interviews */}
      {upcomingInterviews.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">未来 7 天面试</h3>
          <div className="space-y-2">
            {upcomingInterviews.map(({ position, candidate }) => (
              <Card key={candidate.id}>
                <CardBody className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {formatDate(candidate.interviewTime!)}
                    </span>
                    <span className="text-sm font-medium text-blue-600">
                      {formatTime(candidate.interviewTime!)}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {candidate.name}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        | {position.title}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[candidate.status]}`}>
                      {t.candidateStatus[candidate.status]}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onStartInterview(position.id, candidate.id)}
                  >
                    {t.common.view}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
