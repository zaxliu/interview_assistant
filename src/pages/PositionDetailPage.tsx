import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateList } from '@/components/candidates/CandidateList';
import { Button } from '@/components/ui';
import { usePositionStore } from '@/store/positionStore';

export default function PositionDetailPage() {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const navigate = useNavigate();
  const { positionId } = useParams();
  const position = usePositionStore((state) =>
    positionId ? state.positions.find((item) => item.id === positionId) : undefined
  );
  const shouldClampDescription = (position?.description?.length || 0) > 280;

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
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-medium text-gray-700">Job Description</h3>
            {shouldClampDescription && (
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded((value) => !value)}
                className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
              >
                {isDescriptionExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <p
            className={`text-sm text-gray-600 whitespace-pre-wrap ${
              shouldClampDescription && !isDescriptionExpanded ? 'line-clamp-4' : ''
            }`}
          >
            {position.description}
          </p>
        </div>
      )}

      {position.criteria.length > 0 && (
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-1">增量职位要求</h3>
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
