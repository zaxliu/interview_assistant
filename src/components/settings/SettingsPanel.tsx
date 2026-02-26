import React from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useFeishuOAuth } from '@/hooks/useFeishuOAuth';
import { Input, Card, CardHeader, CardBody, Button } from '@/components/ui';

interface SettingsPanelProps {
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const {
    aiApiKey,
    aiBaseUrl,
    aiModel,
    feishuAppId,
    feishuAppSecret,
    feishuCorsProxy,
    setApiKey,
    setBaseUrl,
    setModel,
    setFeishuAppId,
    setFeishuAppSecret,
    setFeishuCorsProxy,
  } = useSettingsStore();

  const { isAuthenticated, startOAuth, logout } = useFeishuOAuth();

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
            label="Base URL"
            type="url"
            value={aiBaseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
          <Input
            label="Model"
            type="text"
            value={aiModel}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4"
          />
          <p className="text-xs text-gray-500">
            PDF parsing uses image-based extraction (OpenAI-compatible format).
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
          <Input
            label="CORS Proxy (required for browser)"
            type="url"
            value={feishuCorsProxy}
            onChange={(e) => setFeishuCorsProxy(e.target.value)}
            placeholder="http://localhost:8010"
          />
          <p className="text-xs text-gray-500">
            Run: <code className="bg-gray-100 px-1 rounded">npx local-cors-proxy --proxyUrl https://open.feishu.cn --port 8010</code>
            <br />Then use: <code className="bg-gray-100 px-1 rounded">http://localhost:8010</code>
          </p>

          {/* OAuth Status and Login */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {isAuthenticated ? (
                  <span className="text-green-600">Connected to Feishu</span>
                ) : (
                  <span className="text-gray-500">Not connected</span>
                )}
              </span>
              {isAuthenticated ? (
                <Button variant="secondary" size="sm" onClick={logout}>
                  Logout
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => startOAuth('settings')}
                  disabled={!feishuAppId || !feishuAppSecret || !feishuCorsProxy}
                >
                  Login with Feishu
                </Button>
              )}
            </div>
            {!feishuAppId || !feishuAppSecret || !feishuCorsProxy ? (
              <p className="text-xs text-amber-600 mt-1">
                Please fill in App ID, App Secret, and CORS Proxy first
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
