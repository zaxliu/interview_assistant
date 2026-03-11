import { useNavigate } from 'react-router-dom';
import { UpcomingInterviews } from '@/components/calendar/UpcomingInterviews';
import { PositionList } from '@/components/positions/PositionList';
import { SettingsWarning } from '@/components/settings/SettingsWarning';

export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <SettingsWarning />
      <UpcomingInterviews
        onStartInterview={(positionId, candidateId) =>
          navigate(`/positions/${positionId}/candidates/${candidateId}/interview`)
        }
      />
      <PositionList
        onSelectPosition={(positionId) => navigate(`/positions/${positionId}`)}
        onEditPosition={(positionId) => navigate(`/positions/${positionId}/edit`)}
        onAddPosition={() => navigate('/positions/new')}
      />
    </div>
  );
}
