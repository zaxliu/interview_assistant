import React from 'react';
import type { Position } from '@/types';
import { CandidateCard } from './CandidateCard';
import { Card, CardBody, Button } from '@/components/ui';

interface CandidateListProps {
  position: Position;
  onSelectCandidate: (candidateId: string) => void;
  onEditCandidate: (candidateId: string) => void;
  onAddCandidate: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  position,
  onSelectCandidate,
  onEditCandidate,
  onAddCandidate,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          Candidates ({position.candidates.length})
        </h3>
        <Button size="sm" onClick={onAddCandidate}>
          + Add Candidate
        </Button>
      </div>

      {position.candidates.length === 0 ? (
        <Card>
          <CardBody className="text-center py-6">
            <p className="text-gray-500 text-sm">No candidates yet</p>
            <Button size="sm" className="mt-2" onClick={onAddCandidate}>
              Add First Candidate
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {position.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onClick={() => onSelectCandidate(candidate.id)}
              onEdit={() => onEditCandidate(candidate.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
