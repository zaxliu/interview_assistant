import { Navigate, useSearchParams, useParams } from 'react-router-dom';
import { InterviewPanel } from '@/components/interview/InterviewPanel';
import { usePositionStore } from '@/store/positionStore';

export default function InterviewPage() {
  const { positionId, candidateId } = useParams();
  const [searchParams] = useSearchParams();
  const getPosition = usePositionStore((state) => state.getPosition);
  const position = positionId ? getPosition(positionId) : undefined;
  const candidate = candidateId ? position?.candidates.find((item) => item.id === candidateId) : undefined;

  if (!positionId || !candidateId || !position || !candidate) {
    return <Navigate to="/404" replace />;
  }

  return (
    <InterviewPanel
      position={position}
      candidate={candidate}
      showPdfViewer={searchParams.get('resume') !== 'hidden'}
    />
  );
}
