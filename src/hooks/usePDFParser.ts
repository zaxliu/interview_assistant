import { useState, useCallback } from 'react';
import {
  parsePDFFromFile,
  parsePDFFromUrl,
  parsePDFFromFileWithAI,
  parsePDFFromUrlWithAI,
} from '@/api/pdf';
import { useSettingsStore } from '@/store/settingsStore';
import type { AIUsage } from '@/types';

interface AIOptions {
  maxPages?: number;
  scale?: number;
  extractStructured?: boolean;
}

export interface ParseProgress {
  current: number;
  total: number;
}

export interface PDFParseResult {
  text: string;
  usage?: AIUsage;
}

export const usePDFParser = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [progress, setProgress] = useState<ParseProgress | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const parseFromFile = useCallback(async (file: File, useAI = false, options?: AIOptions): Promise<PDFParseResult> => {
    setIsLoading(true);
    setError(null);
    setProgress(null);

    try {
      let extractedText: string;
      let usage: AIUsage | undefined;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for file');
        const result = await parsePDFFromFileWithAI(
          file,
          { apiKey: aiApiKey, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 2,
            extractStructured: options?.extractStructured ?? true,
            onProgress: (current, total) => setProgress({ current, total }),
          }
        );
        extractedText = result.text;
        usage = result.usage;
      } else {
        console.log('[usePDFParser] Using standard parsing for file');
        extractedText = await parsePDFFromFile(file);
      }

      setText(extractedText);
      return { text: extractedText, usage };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'PDF 解析失败';
      setError(errorMessage);
      return { text: '' };
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, [aiApiKey, aiModel]);

  const parseFromUrl = useCallback(async (url: string, useAI = false, options?: AIOptions): Promise<PDFParseResult> => {
    setIsLoading(true);
    setError(null);
    setProgress(null);

    try {
      let extractedText: string;
      let usage: AIUsage | undefined;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for URL');
        const result = await parsePDFFromUrlWithAI(
          url,
          { apiKey: aiApiKey, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 2,
            extractStructured: options?.extractStructured ?? true,
            onProgress: (current, total) => setProgress({ current, total }),
          }
        );
        extractedText = result.text;
        usage = result.usage;
      } else {
        console.log('[usePDFParser] Using standard parsing for URL');
        extractedText = await parsePDFFromUrl(url);
      }

      setText(extractedText);
      return { text: extractedText, usage };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '从 URL 解析 PDF 失败';
      setError(errorMessage);
      return { text: '' };
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
