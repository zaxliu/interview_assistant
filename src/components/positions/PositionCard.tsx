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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-gray-900">{position.title}</h4>
              {position.team && (
                <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
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
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-gray-600">
                {candidateCount} {candidateCount === 1 ? 'candidate' : 'candidates'}
              </div>
              {completedCount > 0 && (
                <div className="text-xs text-green-600">
                  {completedCount} completed
                </div>
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
