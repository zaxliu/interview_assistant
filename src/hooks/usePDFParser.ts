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

export const usePDFParser = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');

  const { aiApiKey, aiBaseUrl, aiModel } = useSettingsStore();

  const parseFromFile = useCallback(async (file: File, useAI = false, options?: AIOptions): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      let extractedText: string;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for file');
        extractedText = await parsePDFFromFileWithAI(
          file,
          { apiKey: aiApiKey, baseUrl: aiBaseUrl, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 3,
            extractStructured: options?.extractStructured ?? true
          }
        );
      } else {
        console.log('[usePDFParser] Using standard parsing for file');
        extractedText = await parsePDFFromFile(file);
      }

      setText(extractedText);
      return extractedText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse PDF';
      setError(errorMessage);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, [aiApiKey, aiBaseUrl, aiModel]);

  const parseFromUrl = useCallback(async (url: string, useAI = false, options?: AIOptions): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      let extractedText: string;

      if (useAI && aiApiKey) {
        console.log('[usePDFParser] Using AI parsing for URL');
        extractedText = await parsePDFFromUrlWithAI(
          url,
          { apiKey: aiApiKey, baseUrl: aiBaseUrl, model: aiModel },
          {
            maxPages: options?.maxPages ?? 10,
            scale: options?.scale ?? 3,
            extractStructured: options?.extractStructured ?? true
          }
        );
      } else {
        console.log('[usePDFParser] Using standard parsing for URL');
        extractedText = await parsePDFFromUrl(url);
      }

      setText(extractedText);
      return extractedText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse PDF from URL';
      setError(errorMessage);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, [aiApiKey, aiBaseUrl, aiModel]);

  const clearText = useCallback(() => {
    setText('');
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    text,
    parseFromFile,
    parseFromUrl,
    clearText,
    canUseAI: !!aiApiKey,
  };
};
