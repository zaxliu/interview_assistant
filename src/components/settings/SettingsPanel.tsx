import React, { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { Input, Card, CardHeader, CardBody, Button } from '@/components/ui';
import { testAIApiKey } from '@/api/ai';
import { testFeishuCredentials } from '@/api/feishu';

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
      setAiTestStatus({ loading: false, success: false, message: 'Please enter an API key' });
      return;
    }
    setAiTestStatus({ loading: true });
    const result = await testAIApiKey(aiApiKey, aiModel || 'gpt-4');
    setAiTestStatus({ loading: false, ...result });
  };

  const handleTestFeishu = async () => {
    if (!feishuAppId || !feishuAppSecret) {
      setFeishuTestStatus({ loading: false, success: false, message: 'Please enter App ID and Secret' });
      return;
    }
    setFeishuTestStatus({ loading: true });
    const result = await testFeishuCredentials(feishuAppId, feishuAppSecret);
    setFeishuTestStatus({ loading: false, ...result });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">AI Configuration</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="API Key"
            type="password"
            value={aiApiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your AI API key"
          />
          <Input
            label="Model"
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
              {aiTestStatus.loading ? 'Testing...' : 'Test Connection'}
            </Button>
            {aiTestStatus.message && (
              <span className={`text-xs ${aiTestStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                {aiTestStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            AI provider URL is configured server-side via environment variables.
          </p>
        </CardBody>
      </Card>

      {/* Feishu Configuration */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Feishu Configuration</h3>
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
            placeholder="Enter your Feishu app secret"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestFeishu}
              disabled={feishuTestStatus.loading}
            >
              {feishuTestStatus.loading ? 'Testing...' : 'Test Credentials'}
            </Button>
            {feishuTestStatus.message && (
              <span className={`text-xs ${feishuTestStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                {feishuTestStatus.message}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            CORS proxy is built-in. No additional configuration needed.
          </p>

          {/* OAuth Status and Login */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">Connected</span>
                    {user && (
                      <span className="text-gray-500">as {user.name}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">Not connected - Login via header</span>
                )}
              </span>
              {isAuthenticated && (
                <Button variant="secondary" size="sm" onClick={logout}>
                  Logout
                </Button>
              )}
            </div>
            {!feishuAppId || !feishuAppSecret ? (
              <p className="text-xs text-amber-600 mt-1">
                Please fill in App ID and App Secret first
              </p>
            ) : null}
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
              <p className="text-gray-600 mb-1">Configure this exact URL in Feishu (安全设置 → 重定向 URL):</p>
              <code className="text-blue-600 font-mono break-all">
                {window.location.origin}{window.location.pathname}
              </code>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
