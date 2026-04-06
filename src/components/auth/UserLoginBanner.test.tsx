import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLoginBanner } from './UserLoginBanner';
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
  startOAuth: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/hooks/useFeishuOAuth', () => ({
  useFeishuOAuth: () => authState,
}));

describe('UserLoginBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.user = null;
    useSettingsStore.setState({
      ...useSettingsStore.getState(),
      feishuAppId: 'app-id',
      feishuAppSecret: 'app-secret',
    });
  });

  it('keeps connected state when token exists but profile is still loading', () => {
    authState.isAuthenticated = true;

    render(<UserLoginBanner />);

    expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.getByText('飞书已连接')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
  });

  it('falls back to initial badge when avatar image fails to load', () => {
    authState.isAuthenticated = true;
    authState.user = {
      id: 'user-1',
      name: 'Lewis',
      avatarUrl: 'https://example.com/avatar.png',
      loginTime: '2026-04-06T00:00:00.000Z',
    };

    render(<UserLoginBanner />);

    fireEvent.error(screen.getByRole('img', { name: 'Lewis' }));

    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Lewis' })).not.toBeInTheDocument();
  });
});
