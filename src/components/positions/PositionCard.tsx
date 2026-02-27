import React from 'react';
import type { Position } from '@/types';
import { Card, CardBody } from '@/components/ui';

interface PositionCardProps {
  position: Position;
  onClick: () => void;
  onEdit: () => void;
}

export const PositionCard: React.FC<PositionCardProps> = ({ position, onClick, onEdit }) => {
  const candidates = position.candidates;
  const completedCount = candidates.filter((c) => c.status === 'completed').length;
  const cancelledCount = candidates.filter((c) => c.status === 'cancelled').length;
  const activeCount = candidates.length - completedCount - cancelledCount;
  const totalActive = completedCount + activeCount;

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
            {/* Candidate progress indicator */}
            <div className="flex items-center gap-2">
              {/* Progress bar */}
              {totalActive > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="flex h-2 w-16 rounded overflow-hidden bg-gray-200">
                    {Array.from({ length: totalActive }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 ${i < completedCount ? 'bg-green-500' : 'bg-gray-300'} ${i > 0 ? 'ml-0.5' : ''}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-600">
                    {completedCount}/{totalActive}
                  </span>
                </div>
              )}

              {/* Cancelled indicator */}
              {cancelledCount > 0 && (
                <span className="text-xs text-gray-400 line-through">
                  {cancelledCount} cancelled
                </span>
              )}

              {/* No candidates */}
              {candidates.length === 0 && (
                <span className="text-xs text-gray-400">No candidates</span>
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
