import React, { useMemo } from 'react';
import type { Position, Candidate } from '@/types';
import { CandidateCard } from './CandidateCard';
import { Card, CardBody, Button } from '@/components/ui';

interface CandidateListProps {
  position: Position;
  onSelectCandidate: (candidateId: string) => void;
  onEditCandidate: (candidateId: string) => void;
  onAddCandidate: () => void;
}

// Sort candidates: 1) nearest active interview, 2) completed, 3) cancelled, 4) pending
const sortCandidates = (candidates: Candidate[]): Candidate[] => {
  const now = new Date();

  return [...candidates].sort((a, b) => {
    // Define status priority groups
    const isActive = (c: Candidate) => c.status === 'scheduled' || c.status === 'in_progress';

    // Group 1: Active interviews (scheduled/in_progress) - sort by nearest time first
    if (isActive(a) && isActive(b)) {
      const aTime = a.interviewTime ? new Date(a.interviewTime).getTime() : Infinity;
      const bTime = b.interviewTime ? new Date(b.interviewTime).getTime() : Infinity;
      // Sort by distance from now (past interviews at end, future interviews nearest first)
      const aDiff = Math.abs(aTime - now.getTime());
      const bDiff = Math.abs(bTime - now.getTime());
      return aDiff - bDiff;
    }
    if (isActive(a)) return -1;
    if (isActive(b)) return 1;

    // Group 2: Completed
    if (a.status === 'completed' && b.status !== 'completed') return -1;
    if (b.status === 'completed' && a.status !== 'completed') return 1;

    // Group 3: Cancelled
    if (a.status === 'cancelled' && b.status !== 'cancelled') return -1;
    if (b.status === 'cancelled' && a.status !== 'cancelled') return 1;

    // Within same group, sort by interview time if available
    if (a.interviewTime && b.interviewTime) {
      return new Date(b.interviewTime).getTime() - new Date(a.interviewTime).getTime();
    }
    if (a.interviewTime) return -1;
    if (b.interviewTime) return 1;

    return 0;
  });
};

export const CandidateList: React.FC<CandidateListProps> = ({
  position,
  onSelectCandidate,
  onEditCandidate,
  onAddCandidate,
}) => {
  const sortedCandidates = useMemo(
    () => sortCandidates(position.candidates),
    [position.candidates]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          Candidates ({sortedCandidates.length})
        </h3>
        <Button size="sm" onClick={onAddCandidate}>
          + Add Candidate
        </Button>
      </div>

      {sortedCandidates.length === 0 ? (
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
          {sortedCandidates.map((candidate) => (
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
