import { useNavigate } from 'react-router-dom';
import { UpcomingInterviews } from '@/components/calendar/UpcomingInterviews';
import { PositionList } from '@/components/positions/PositionList';
import { SettingsWarning } from '@/components/settings/SettingsWarning';
import { isWintalentInterviewLink } from '@/api/wintalent';
import { usePositionStore } from '@/store/positionStore';
import { hasImportedResume } from '@/utils/resume';

export default function DashboardPage() {
  const navigate = useNavigate();
  const positions = usePositionStore((state) => state.positions);

  const handleStartInterview = (positionId: string, candidateId: string) => {
    const position = positions.find((item) => item.id === positionId);
    const candidate = position?.candidates.find((item) => item.id === candidateId);
    if (!position || !candidate) {
      navigate(`/positions/${positionId}/candidates/${candidateId}/interview`);
      return;
    }

    if (!hasImportedResume(candidate) && isWintalentInterviewLink(candidate.candidateLink)) {
      navigate(`/positions/${positionId}/candidates/${candidateId}/edit?autoImport=1&from=start`);
      return;
    }

    navigate(`/positions/${positionId}/candidates/${candidateId}/interview`);
  };

  return (
    <div className="space-y-6">
      <SettingsWarning />
      <UpcomingInterviews onStartInterview={handleStartInterview} />
      <PositionList
        onSelectPosition={(positionId) => navigate(`/positions/${positionId}`)}
        onEditPosition={(positionId) => navigate(`/positions/${positionId}/edit`)}
        onAddPosition={() => navigate('/positions/new')}
      />
    </div>
  );
}
