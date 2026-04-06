import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { useSettingsStore } from '@/store/settingsStore';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  user: null as
    | {
        id: string;
        name: string;
        avatarUrl?: string;
        loginTime: string;
      }
    | null,
  logout: vi.fn(),
}));

vi.mock('@/hooks/useFeishuOAuth', () => ({
  useFeishuOAuth: () => authState,
}));

vi.mock('@/utils/feishuOAuth', () => ({
  getFeishuOAuthRedirectUri: () => 'https://example.com/',
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.user = null;
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      aiModel: 'gpt-4.1',
    });
  });

  it('shows connected state when token exists but profile is not loaded yet', () => {
    authState.isAuthenticated = true;

    render(<SettingsPanel />);

    expect(screen.getByText('已连接')).toBeInTheDocument();
    expect(screen.getByText('账号信息获取中')).toBeInTheDocument();
    expect(screen.queryByText('未连接，请在页头点击登录')).not.toBeInTheDocument();
  });
});
