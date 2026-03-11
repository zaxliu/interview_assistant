import React from 'react';
import type { Candidate } from '@/types';
import { Card, CardBody } from '@/components/ui';
import { getPreferredResumeText } from '@/utils/resume';

interface CandidateCardProps {
  candidate: Candidate;
  onClick: () => void;
  onEdit: () => void;
}

const statusColors: Record<Candidate['status'], string> = {
  pending: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const statusLabels: Record<Candidate['status'], string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  onClick,
  onEdit,
}) => {
  const hasResume = Boolean(getPreferredResumeText(candidate));
  const formatInterviewTime = (time?: string) => {
    if (!time) return null;
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card onClick={onClick}>
      <CardBody className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {candidate.name.charAt(0)}
              </span>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-900">{candidate.name}</h4>
              {candidate.interviewTime && (
                <p className="text-xs text-gray-500">
                  {formatInterviewTime(candidate.interviewTime)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasResume && (
              <span className="text-xs text-gray-400" title="Resume uploaded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
              title="Edit candidate / Upload resume"
            >
              Edit
            </button>
            <span
              className={`text-xs px-2 py-0.5 rounded ${statusColors[candidate.status]}`}
            >
              {statusLabels[candidate.status]}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
