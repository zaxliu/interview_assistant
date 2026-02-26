import React from 'react';
import type { EvaluationDimension } from '@/types';
import { Card, CardBody, Input, Textarea, Select, Button } from '@/components/ui';

interface EvaluationDimensionCardProps {
  dimension: EvaluationDimension;
  onUpdate: (updates: Partial<EvaluationDimension>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const scoreOptions = [
  { value: '1', label: '1 - Poor' },
  { value: '2', label: '2 - Below Average' },
  { value: '3', label: '3 - Average' },
  { value: '4', label: '4 - Good' },
  { value: '5', label: '5 - Excellent' },
];

export const EvaluationDimensionCard: React.FC<EvaluationDimensionCardProps> = ({
  dimension,
  onUpdate,
  onRemove,
  canRemove,
}) => {
  return (
    <Card>
      <CardBody className="py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={dimension.dimension}
                onChange={(e) => onUpdate({ dimension: e.target.value })}
                className="w-40"
                placeholder="Dimension name"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-600">Score:</span>
                <Select
                  value={dimension.score.toString()}
                  onChange={(e) => onUpdate({ score: parseInt(e.target.value) })}
                  options={scoreOptions}
                  className="w-36"
                />
              </div>
              {canRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="text-gray-400 hover:text-red-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>

            <Textarea
              value={dimension.assessment_points}
              onChange={(e) => onUpdate({ assessment_points: e.target.value })}
              placeholder="Detailed assessment points..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
