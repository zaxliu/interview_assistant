import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '@/components/candidates/CandidateList';
import { Button } from '@/components/ui';
import { usePositionStore } from '@/store/positionStore';

export default function PositionDetailPage() {
  const navigate = useNavigate();
  const { positionId } = useParams();
  const getPosition = usePositionStore((state) => state.getPosition);
  const position = positionId ? getPosition(positionId) : undefined;

  if (!positionId || !position) {
    return <Navigate to="/404" replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{position.title}</h2>
          {position.team && <p className="text-sm text-gray-500">{position.team}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/positions/${position.id}/edit`)}>
          Edit Position
        </Button>
      </div>

      {position.description && (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Job Description</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{position.description}</p>
        </div>
      )}

      {position.criteria.length > 0 && (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Evaluation Criteria</h3>
          <ul className="text-sm text-gray-600 list-disc list-inside">
            {position.criteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}

      <CandidateList
        position={position}
        onSelectCandidate={(candidateId) =>
          navigate(`/positions/${position.id}/candidates/${candidateId}/interview`)
        }
        onEditCandidate={(candidateId) =>
          navigate(`/positions/${position.id}/candidates/${candidateId}/edit`)
        }
        onAddCandidate={() => navigate(`/positions/${position.id}/candidates/new`)}
      />
    </div>
  );
}
