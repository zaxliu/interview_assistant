import React from 'react';
import { usePositionStore } from '@/store/positionStore';
import { Card, CardBody, Button } from '@/components/ui';

interface UpcomingInterviewsProps {
  onStartInterview: (positionId: string, candidateId: string) => void;
}

export const UpcomingInterviews: React.FC<UpcomingInterviewsProps> = ({
  onStartInterview,
}) => {
  const { positions } = usePositionStore();

  // Get today's interviews
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayInterviews = positions.flatMap((position) =>
    position.candidates
      .filter((candidate) => {
        if (!candidate.interviewTime) return false;
        const interviewDate = new Date(candidate.interviewTime);
        return interviewDate >= today && interviewDate < tomorrow;
      })
      .map((candidate) => ({
        position,
        candidate,
      }))
  );

  // Get upcoming interviews (next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingInterviews = positions.flatMap((position) =>
    position.candidates
      .filter((candidate) => {
        if (!candidate.interviewTime) return false;
        const interviewDate = new Date(candidate.interviewTime);
        return interviewDate >= tomorrow && interviewDate < nextWeek;
      })
      .map((candidate) => ({
        position,
        candidate,
      }))
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
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
          <h3 className="text-sm font-medium text-gray-700 mb-2">Today's Interviews</h3>
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
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onStartInterview(position.id, candidate.id)}
                  >
                    Start
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
          <h3 className="text-sm font-medium text-gray-700 mb-2">Upcoming Interviews</h3>
          <div className="space-y-2">
            {upcomingInterviews.slice(0, 5).map(({ position, candidate }) => (
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
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onStartInterview(position.id, candidate.id)}
                  >
                    View
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
