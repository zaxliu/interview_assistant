import { useState, useCallback } from 'react';
import {
  syncInterviewsFromCalendar,
  createFeishuDoc,
  extractLinksFromDescription,
} from '@/api/feishu';
import { useSettingsStore } from '@/store/settingsStore';
import type { CalendarEvent, InterviewResult } from '@/types';

export const useFeishuCalendar = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { feishuAppId, feishuAppSecret, feishuCorsProxy, feishuUserAccessToken } = useSettingsStore();

  const syncCalendar = useCallback(
    async (days: number = 30): Promise<{
      events: CalendarEvent[];
      positions: Map<string, { title: string; team: string }>;
    } | null> => {
      // Check if we have user_access_token (from OAuth)
      if (!feishuUserAccessToken) {
        setError('Please login with Feishu first (click "Login with Feishu" in Settings)');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Try with CORS proxy first, then without
        const result = await syncInterviewsFromCalendar(
          days,
          feishuCorsProxy || undefined,
          feishuUserAccessToken || undefined,
          feishuAppId || undefined,
          feishuAppSecret || undefined
        );
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sync calendar';
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [feishuAppId, feishuAppSecret, feishuCorsProxy, feishuUserAccessToken]
  );

  const createDoc = useCallback(
    async (
      result: InterviewResult,
      candidateName: string,
      positionTitle: string
    ): Promise<{ success: boolean; message: string; docUrl?: string }> => {
      if (!feishuUserAccessToken) {
        setError('Please login with Feishu first');
        return { success: false, message: 'Not authenticated with Feishu' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await createFeishuDoc(
          result,
          candidateName,
          positionTitle,
          feishuCorsProxy || undefined,
          feishuUserAccessToken || undefined,
          feishuAppId || undefined,
          feishuAppSecret || undefined
        );

        if (!response.success) {
          setError(response.message);
        }

        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create Feishu doc';
        setError(errorMessage);
        return { success: false, message: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [feishuAppId, feishuAppSecret, feishuCorsProxy, feishuUserAccessToken]
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
