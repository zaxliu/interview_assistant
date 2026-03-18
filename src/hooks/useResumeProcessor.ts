import { useCallback, useState } from 'react';
import { processResumeText } from '@/api/ai';
import { useSettingsStore } from '@/store/settingsStore';
import { emptyResumeHighlights, normalizeMarkdownText } from '@/utils/resume';
import type { AIUsage, ResumeHighlights } from '@/types';

interface ResumeProcessingOutput {
  markdown: string;
  highlights: ResumeHighlights;
  usage?: AIUsage;
}

export const useResumeProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { aiApiKey, aiModel } = useSettingsStore();

  const processResume = useCallback(
    async (rawText: string): Promise<ResumeProcessingOutput> => {
      const trimmed = rawText.trim();
      if (!trimmed) {
        return { markdown: '', highlights: emptyResumeHighlights() };
      }

      setIsProcessing(true);
      setError(null);

      try {
        if (!aiApiKey) {
          return {
            markdown: normalizeMarkdownText(trimmed),
            highlights: emptyResumeHighlights(),
          };
        }

        const result = await processResumeText({ apiKey: aiApiKey, model: aiModel }, trimmed);
        return {
          ...result.data,
          usage: result.usage,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : '简历处理失败';
        setError(message);
        return {
          markdown: normalizeMarkdownText(trimmed),
          highlights: emptyResumeHighlights(),
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [aiApiKey, aiModel]
  );

  return {
    isProcessing,
    error,
    processResume,
  };
};
