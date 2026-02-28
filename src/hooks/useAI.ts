import { useState, useCallback } from 'react';
import { generateQuestions, generateSummary } from '@/api/ai';
import { useSettingsStore } from '@/store/settingsStore';
import type { Question, InterviewResult, CodingChallenge } from '@/types';

export const useAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const generateInterviewQuestions = useCallback(
    async (jobDescription: string, resumeText: string, criteria: string[]): Promise<Question[]> => {
      if (!aiApiKey) {
        setError('AI API key not configured');
        return [];
      }

      setIsLoading(true);
      setError(null);

      try {
        const questions = await generateQuestions(
          { apiKey: aiApiKey, model: aiModel },
          jobDescription,
          resumeText,
          criteria
        );
        return questions;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate questions');
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [aiApiKey, aiModel]
  );

  const generateInterviewSummary = useCallback(
    async (
      questions: Question[],
      jobDescription: string,
      resumeText: string,
      candidateName: string,
      positionTitle: string,
      quickNotes?: string,
      codingChallenges?: CodingChallenge[]
    ): Promise<InterviewResult | null> => {
      if (!aiApiKey) {
        setError('AI API key not configured');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await generateSummary(
          { apiKey: aiApiKey, model: aiModel },
          questions,
          jobDescription,
          resumeText,
          candidateName,
          positionTitle,
          quickNotes,
          codingChallenges
        );
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate summary');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [aiApiKey, aiModel]
  );

  return {
    isLoading,
    error,
    generateInterviewQuestions,
    generateInterviewSummary,
  };
};
