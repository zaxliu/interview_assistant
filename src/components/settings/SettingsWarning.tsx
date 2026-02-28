import React from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { Card, CardBody } from '@/components/ui';

export const SettingsWarning: React.FC = () => {
  const {
    aiApiKey,
    feishuAppId,
    feishuAppSecret,
    feishuUserAccessToken,
  } = useSettingsStore();

  const missingItems: string[] = [];

  if (!aiApiKey) {
    missingItems.push('AI API Key');
  }
  if (!feishuAppId) {
    missingItems.push('Feishu App ID');
  }
  if (!feishuAppSecret) {
    missingItems.push('Feishu App Secret');
  }
  if (!feishuUserAccessToken) {
    missingItems.push('Login to Feishu');
  }

  if (missingItems.length === 0) {
    return null;
  }

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardBody className="py-3">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-amber-800">Setup Required</h3>
            <p className="text-xs text-amber-700 mt-1">
              Please configure: {missingItems.join(', ')}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
