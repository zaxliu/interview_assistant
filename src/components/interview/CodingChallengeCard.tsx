import React from 'react';
import type { CodingChallenge } from '@/types';
import { Card, CardBody, Textarea, Select, Button } from '@/components/ui';

interface CodingChallengeCardProps {
  challenge: CodingChallenge;
  onUpdate: (updates: Partial<CodingChallenge>) => void;
  onRemove: () => void;
}

const evaluationOptions = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'acceptable', label: 'Acceptable' },
  { value: 'needs_improvement', label: 'Needs Improvement' },
];

const resultOptions = [
  { value: 'pass', label: 'Pass' },
  { value: 'partial', label: 'Partial' },
  { value: 'fail', label: 'Fail' },
  { value: 'not_completed', label: 'Not Completed' },
];

const resultColors = {
  pass: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-red-100 text-red-700',
  not_completed: 'bg-gray-100 text-gray-500',
};

export const CodingChallengeCard: React.FC<CodingChallengeCardProps> = ({
  challenge,
  onUpdate,
  onRemove,
}) => {
  return (
    <Card>
      <CardBody className="py-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
              Code
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${resultColors[challenge.result]}`}>
              {resultOptions.find(o => o.value === challenge.result)?.label || 'Not Completed'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-red-500"
            onClick={onRemove}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>

        {/* Problem */}
        <Textarea
          label="Problem Description"
          value={challenge.problem}
          onChange={(e) => onUpdate({ problem: e.target.value })}
          placeholder="Describe the coding challenge..."
          rows={2}
          className="text-sm"
        />

        {/* Solution/Notes */}
        <Textarea
          label="Solution / Notes"
          value={challenge.solution || ''}
          onChange={(e) => onUpdate({ solution: e.target.value })}
          placeholder="Candidate's solution and notes..."
          rows={3}
          className="text-sm font-mono text-xs"
        />

        {/* Evaluation */}
        <div className="grid grid-cols-4 gap-2">
          <Select
            label="Time"
            value={challenge.evaluation?.timeComplexity || ''}
            onChange={(e) =>
              onUpdate({
                evaluation: {
                  ...challenge.evaluation,
                  timeComplexity: e.target.value as 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | undefined
                }
              })
            }
            options={[{ value: '', label: '-' }, ...evaluationOptions]}
            className="text-xs"
          />
          <Select
            label="Code Quality"
            value={challenge.evaluation?.codeQuality || ''}
            onChange={(e) =>
              onUpdate({
                evaluation: {
                  ...challenge.evaluation,
                  codeQuality: e.target.value as 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | undefined
                }
              })
            }
            options={[{ value: '', label: '-' }, ...evaluationOptions]}
            className="text-xs"
          />
          <Select
            label="Communication"
            value={challenge.evaluation?.communication || ''}
            onChange={(e) =>
              onUpdate({
                evaluation: {
                  ...challenge.evaluation,
                  communication: e.target.value as 'excellent' | 'good' | 'acceptable' | 'needs_improvement' | undefined
                }
              })
            }
            options={[{ value: '', label: '-' }, ...evaluationOptions]}
            className="text-xs"
          />
          <Select
            label="Result"
            value={challenge.result}
            onChange={(e) => onUpdate({ result: e.target.value as 'pass' | 'partial' | 'fail' | 'not_completed' })}
            options={resultOptions}
            className="text-xs"
          />
        </div>
      </CardBody>
    </Card>
  );
};
