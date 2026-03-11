import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PositionForm } from '@/components/positions/PositionForm';
import { usePositionStore } from '@/store/positionStore';

export default function PositionFormPage() {
  const navigate = useNavigate();
  const { positionId } = useParams();
  const getPosition = usePositionStore((state) => state.getPosition);
  const position = positionId ? getPosition(positionId) : undefined;

  if (positionId && !position) {
    return <Navigate to="/404" replace />;
  }

  return (
    <PositionForm
      position={position}
      onSave={(savedPositionId) => navigate(`/positions/${savedPositionId}`)}
      onCancel={() => navigate(positionId ? `/positions/${positionId}` : '/')}
    />
  );
}
