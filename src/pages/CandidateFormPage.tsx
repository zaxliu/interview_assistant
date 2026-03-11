import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateForm } from '@/components/candidates/CandidateForm';
import { usePositionStore } from '@/store/positionStore';

export default function CandidateFormPage() {
  const navigate = useNavigate();
  const { positionId, candidateId } = useParams();
  const position = usePositionStore((state) =>
    positionId ? state.positions.find((item) => item.id === positionId) : undefined
  );
  const candidate = candidateId ? position?.candidates.find((item) => item.id === candidateId) : undefined;

  if (!positionId || !position || (candidateId && !candidate)) {
    return <Navigate to="/404" replace />;
  }

  return (
    <CandidateForm
      positionId={position.id}
      candidate={candidate}
      onSave={(savedCandidateId) =>
        navigate(`/positions/${position.id}/candidates/${savedCandidateId}/interview`)
      }
      onCancel={() => navigate(`/positions/${position.id}`)}
    />
  );
}
