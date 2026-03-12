import { useState, useCallback } from 'react';
import { extractMeetingNotesInsights, generateQuestions, generateSummary } from '@/api/ai';
import { useSettingsStore } from '@/store/settingsStore';
import type { Question, InterviewResult, CodingChallenge } from '@/types';
import type { MeetingNotesExtractionResult } from '@/api/ai';

export const useAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const generateInterviewQuestions = useCallback(
    async (jobDescription: string, resumeText: string, criteria: string[]): Promise<Question[]> => {
      if (!aiApiKey) {
        setError('未配置 AI API Key');
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
        setError(err instanceof Error ? err.message : '生成面试问题失败');
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
        setError('未配置 AI API Key');
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
        setError(err instanceof Error ? err.message : '生成面试总结失败');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [aiApiKey, aiModel]
  );

  const extractInterviewNotesInsights = useCallback(
    async (
      existingQuestions: Question[],
      meetingNotesContent: string
    ): Promise<MeetingNotesExtractionResult | null> => {
      if (!aiApiKey) {
        setError('未配置 AI API Key');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        return await extractMeetingNotesInsights(
          { apiKey: aiApiKey, model: aiModel },
          existingQuestions,
          meetingNotesContent
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : '提取会议纪要洞察失败');
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
    extractInterviewNotesInsights,
  };
};
