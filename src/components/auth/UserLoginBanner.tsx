import React from 'react';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';

export const UserLoginBanner: React.FC = () => {
  const { feishuAppId, feishuAppSecret } = useSettingsStore();
  const { isAuthenticated, user, startOAuth, logout } = useFeishuOAuth();

  const canLogin = feishuAppId && feishuAppSecret;

  if (isAuthenticated && user) {
    // Logged in: show avatar, name, and logout button
    return (
      <div className="flex items-center gap-2">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm text-gray-700 hidden sm:inline">{user.name}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          {t.common.logout}
        </Button>
      </div>
    );
  }

  // Not logged in: show login button
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => startOAuth()}
      disabled={!canLogin}
      title={!canLogin ? '请先完成飞书配置' : '使用飞书登录'}
    >
      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
      {t.common.login}
    </Button>
  );
};
