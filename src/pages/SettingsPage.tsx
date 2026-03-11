import { useNavigate } from 'react-router-dom';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export default function SettingsPage() {
  const navigate = useNavigate();

  return <SettingsPanel onClose={() => navigate('/')} />;
}
