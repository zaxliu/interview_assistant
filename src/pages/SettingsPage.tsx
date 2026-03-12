import { useLocation, useNavigate } from 'react-router-dom';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const from =
    location.state &&
    typeof location.state === 'object' &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : null;

  const handleClose = () => {
    if (from && from !== '/settings') {
      navigate(from);
      return;
    }
    navigate('/');
  };

  return <SettingsPanel onClose={handleClose} />;
}
