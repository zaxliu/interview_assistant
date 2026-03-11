import { Navigate, useParams } from 'react-router-dom';
import { SummaryEditor } from '@/components/summary/SummaryEditor';
import { usePositionStore } from '@/store/positionStore';

export default function SummaryPage() {
  const { positionId, candidateId } = useParams();
  const position = usePositionStore((state) =>
    positionId ? state.positions.find((item) => item.id === positionId) : undefined
  );
  const candidate = candidateId ? position?.candidates.find((item) => item.id === candidateId) : undefined;

  if (!positionId || !candidateId || !position || !candidate) {
    return <Navigate to="/404" replace />;
  }

  return <SummaryEditor position={position} candidate={candidate} autoGenerate />;
}
