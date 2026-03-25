import { useState, useCallback } from 'react';
import {
  syncInterviewsFromCalendar,
  createFeishuDoc,
  extractLinksFromDescription,
  type SyncCalendarWindow,
} from '@/api/feishu';
import { useSettingsStore } from '@/store/settingsStore';
import type { CalendarEvent, InterviewResult } from '@/types';
import { trackEvent } from '@/lib/analytics';

export const useFeishuCalendar = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { feishuAppId, feishuAppSecret, feishuUserAccessToken } = useSettingsStore();

  const syncCalendar = useCallback(
    async (syncWindow: number | SyncCalendarWindow = 30): Promise<{
      events: CalendarEvent[];
      positions: Map<string, { title: string; team: string }>;
    } | null> => {
      // Check if we have user_access_token (from OAuth)
      if (!feishuUserAccessToken) {
        setError('请先登录飞书（可在设置页点击“登录”）');
        return null;
      }

      setIsLoading(true);
      setError(null);
      const startedAt = Date.now();

      try {
        const result = await syncInterviewsFromCalendar(
          syncWindow,
          feishuUserAccessToken || undefined,
          feishuAppId || undefined,
          feishuAppSecret || undefined
        );
        trackEvent({
          eventName: 'calendar_sync_succeeded',
          feature: 'calendar_sync',
          success: true,
          durationMs: Date.now() - startedAt,
          details: {
            syncedEvents: result.events.length,
            positions: result.positions.size,
          },
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '同步日历失败';
        setError(errorMessage);
        trackEvent({
          eventName: 'calendar_sync_failed',
          feature: 'calendar_sync',
          success: false,
          durationMs: Date.now() - startedAt,
          errorCode: errorMessage,
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [feishuAppId, feishuAppSecret, feishuUserAccessToken]
  );

  const createDoc = useCallback(
    async (
      result: InterviewResult,
      candidateName: string,
      positionTitle: string
    ): Promise<{ success: boolean; message: string; docUrl?: string }> => {
      if (!feishuUserAccessToken) {
        setError('请先登录飞书');
        return { success: false, message: '当前未登录飞书' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await createFeishuDoc(
          result,
          candidateName,
          positionTitle,
          feishuUserAccessToken || undefined,
          feishuAppId || undefined,
          feishuAppSecret || undefined
        );

        if (!response.success) {
          setError(response.message);
        }

        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '创建飞书文档失败';
        setError(errorMessage);
        return { success: false, message: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [feishuAppId, feishuAppSecret, feishuUserAccessToken]
  );

  const extractLinks = useCallback((description: string | undefined) => {
    return extractLinksFromDescription(description);
  }, []);

  return {
    isLoading,
    error,
    syncCalendar,
    createDoc,
    extractLinks,
  };
};
