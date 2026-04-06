import React from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { Input, Card, CardHeader, CardBody, Button } from '@/components/ui';
import { zhCN as t } from '@/i18n/zhCN';
import { getFeishuOAuthRedirectUri } from '@/utils/feishuOAuth';

interface SettingsPanelProps {
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const {
    aiModel,
    setModel,
  } = useSettingsStore();

  const { isAuthenticated, user, logout } = useFeishuOAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t.app.settings}</h2>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.common.close}
          </Button>
        )}
      </div>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">AI 配置</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="模型"
            type="text"
            value={aiModel}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4"
          />
          <p className="text-xs text-gray-500">
            模型可在前端调整，API Key 和服务地址由服务端环境变量提供，不在浏览器中显示或保存。
          </p>
        </CardBody>
      </Card>

      {/* Feishu Configuration */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">飞书配置</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-gray-500">
            App ID、App Secret 和代理相关配置由服务端环境变量提供，不在前端显示。
          </p>

          {/* OAuth Status and Login */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">已连接</span>
                    <span className="text-gray-500">{user ? `账号：${user.name}` : '账号信息获取中'}</span>
                  </div>
                ) : (
                  <span className="text-gray-500">未连接，请在页头点击登录</span>
                )}
              </span>
              {isAuthenticated && (
                <Button variant="secondary" size="sm" onClick={logout}>
                  {t.common.logout}
                </Button>
              )}
            </div>
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <p className="text-gray-600 mb-1">请在飞书后台配置以下精确回调地址（安全设置 → 重定向 URL）：</p>
              <code className="text-blue-600 font-mono break-all">
                {getFeishuOAuthRedirectUri()}
              </code>
            </div>
            <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-800">
              <p className="font-medium mb-1">若登录页提示 “This account doesn't have permission to authorize login”：</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>在飞书开放平台确认应用已发布到当前租户，且“可用范围”包含该用户所在部门或成员。</li>
                <li>若是测试版应用，请将该账号加入测试人员名单。</li>
                <li>若刚调整权限范围或可见范围，请发布新版本后重试登录。</li>
              </ol>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
