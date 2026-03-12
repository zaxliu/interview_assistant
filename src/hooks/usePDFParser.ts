import { useState, useCallback } from 'react';
import {
  parsePDFFromFile,
  parsePDFFromUrl,
  parsePDFFromFileWithAI,
  parsePDFFromUrlWithAI,
} from '@/api/pdf';
import { useSettingsStore } from '@/store/settingsStore';

interface AIOptions {
  maxPages?: number;
  scale?: number;
  extractStructured?: boolean;
}

export interface ParseProgress {
  current: number;
  total: number;
}

export const usePDFParser = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [progress, setProgress] = useState<ParseProgress | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const parseFromFile = useCallback(async (file: File, useAI = false, options?: AIOptions): Promise<string> => {
    setIsLoading(true);
    setError(null);
    setProgress(null);

    try {
      let extractedText: string;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for file');
        extractedText = await parsePDFFromFileWithAI(
          file,
          { apiKey: aiApiKey, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 2,
            extractStructured: options?.extractStructured ?? true,
            onProgress: (current, total) => setProgress({ current, total }),
          }
        );
      } else {
        console.log('[usePDFParser] Using standard parsing for file');
        extractedText = await parsePDFFromFile(file);
      }

      setText(extractedText);
      return extractedText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'PDF 解析失败';
      setError(errorMessage);
      return '';
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, [aiApiKey, aiModel]);

  const parseFromUrl = useCallback(async (url: string, useAI = false, options?: AIOptions): Promise<string> => {
    setIsLoading(true);
    setError(null);
    setProgress(null);

    try {
      let extractedText: string;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for URL');
        extractedText = await parsePDFFromUrlWithAI(
          url,
          { apiKey: aiApiKey, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 2,
            extractStructured: options?.extractStructured ?? true,
            onProgress: (current, total) => setProgress({ current, total }),
          }
        );
      } else {
        console.log('[usePDFParser] Using standard parsing for URL');
        extractedText = await parsePDFFromUrl(url);
      }

      setText(extractedText);
      return extractedText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '从 URL 解析 PDF 失败';
      setError(errorMessage);
      return '';
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, [aiApiKey, aiModel]);

  const clearText = useCallback(() => {
    setText('');
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    text,
    progress,
    parseFromFile,
    parseFromUrl,
    clearText,
    canUseAI: !!aiApiKey,
  };
};
