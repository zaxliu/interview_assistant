import React, { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { Input, Card, CardHeader, CardBody, Button } from '@/components/ui';
import { testAIApiKey } from '@/api/ai';
import { testFeishuCredentials } from '@/api/feishu';
import { zhCN as t } from '@/i18n/zhCN';
import { getFeishuOAuthRedirectUri } from '@/utils/feishuOAuth';

interface SettingsPanelProps {
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const {
    aiApiKey,
    aiModel,
    feishuAppId,
    feishuAppSecret,
    setApiKey,
    setModel,
    setFeishuAppId,
    setFeishuAppSecret,
  } = useSettingsStore();

  const { isAuthenticated, user, logout } = useFeishuOAuth();

  const [aiTestStatus, setAiTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({ loading: false });
  const [feishuTestStatus, setFeishuTestStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({ loading: false });

  const handleTestAI = async () => {
    if (!aiApiKey) {
      setAiTestStatus({ loading: false, success: false, message: '请先填写 API Key' });
      return;
    }
    setAiTestStatus({ loading: true });
    const result = await testAIApiKey(aiApiKey, aiModel || 'gpt-4');
    setAiTestStatus({ loading: false, ...result });
  };

  const handleTestFeishu = async () => {
    if (!feishuAppId || !feishuAppSecret) {
      setFeishuTestStatus({ loading: false, success: false, message: '请先填写飞书 App ID 和 App Secret' });
      return;
    }
    setFeishuTestStatus({ loading: true });
    const result = await testFeishuCredentials(feishuAppId, feishuAppSecret);
    setFeishuTestStatus({ loading: false, ...result });
  };

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
            label="API Key"
            type="password"
            value={aiApiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="请输入 AI API Key"
          />
          <Input
            label="模型"
            type="text"
            value={aiModel}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestAI}
              disabled={aiTestStatus.loading}
            >
              {aiTestStatus.loading ? t.common.testing : '测试连接'}
            </Button>
            {aiTestStatus.message && (
              <span className={`text-xs ${aiTestStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                {aiTestStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            AI 提供方地址由服务端环境变量配置，无需在前端填写。
          </p>
        </CardBody>
      </Card>

      {/* Feishu Configuration */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">飞书配置</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="App ID"
            type="text"
            value={feishuAppId}
            onChange={(e) => setFeishuAppId(e.target.value)}
            placeholder="cli_xxx"
          />
          <Input
            label="App Secret"
            type="password"
            value={feishuAppSecret}
            onChange={(e) => setFeishuAppSecret(e.target.value)}
            placeholder="请输入飞书 App Secret"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestFeishu}
              disabled={feishuTestStatus.loading}
            >
              {feishuTestStatus.loading ? t.common.testing : '测试凭证'}
            </Button>
            {feishuTestStatus.message && (
              <span className={`text-xs ${feishuTestStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                {feishuTestStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            已内置 CORS 代理，无需额外配置。
          </p>

          {/* OAuth Status and Login */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">已连接</span>
                    {user && (
                      <span className="text-gray-500">账号：{user.name}</span>
                    )}
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
            {!feishuAppId || !feishuAppSecret ? (
              <p className="text-xs text-amber-600 mt-1">
                请先填写 App ID 和 App Secret
              </p>
            ) : null}
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
