import { Navigate, useParams } from 'react-router-dom';
import { SummaryEditor } from '@/components/summary/SummaryEditor';
import { usePositionStore } from '@/store/positionStore';

export default function SummaryPage() {
  const { positionId, candidateId } = useParams();
  const getPosition = usePositionStore((state) => state.getPosition);
  const position = positionId ? getPosition(positionId) : undefined;
  const candidate = candidateId ? position?.candidates.find((item) => item.id === candidateId) : undefined;

  if (!positionId || !candidateId || !position || !candidate) {
    return <Navigate to="/404" replace />;
  }

  return <SummaryEditor position={position} candidate={candidate} autoGenerate />;
}
