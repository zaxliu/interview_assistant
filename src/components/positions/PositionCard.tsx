import React from 'react';
import type { Position } from '@/types';
import { Card, CardBody } from '@/components/ui';

interface PositionCardProps {
  position: Position;
  onClick: () => void;
  onEdit: () => void;
}

export const PositionCard: React.FC<PositionCardProps> = ({ position, onClick, onEdit }) => {
  const candidateCount = position.candidates.length;
  const completedCount = position.candidates.filter(
    (c) => c.status === 'completed'
  ).length;

  return (
    <Card onClick={onClick}>
      <CardBody className="py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-900">{position.title}</h4>
              {position.team && (
                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  {position.team}
                </span>
              )}
            </div>
            {position.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                {position.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-xs text-gray-500 text-right whitespace-nowrap">
              <span className="text-gray-700">{candidateCount}</span> candidates
              {completedCount > 0 && (
                <span className="text-green-600 ml-1">({completedCount} done)</span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
              title="Edit position / Add job description"
            >
              Edit
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
