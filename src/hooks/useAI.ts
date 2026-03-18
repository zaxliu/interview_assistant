import { useState, useCallback } from 'react';
import { extractMeetingNotesInsights, generateQuestions, generateSummary } from '@/api/ai';
import { useSettingsStore } from '@/store/settingsStore';
import type { Question, InterviewResult, CodingChallenge, HistoricalInterviewReview } from '@/types';
import type { AIResultWithUsage, MeetingNotesExtractionResult } from '@/api/ai';

export const useAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const generateInterviewQuestions = useCallback(
    async (
      jobDescription: string,
      resumeText: string,
      criteria: string[],
      historicalInterviewReviews?: HistoricalInterviewReview[]
    ): Promise<AIResultWithUsage<Question[]>> => {
      if (!aiApiKey) {
        setError('未配置 AI API Key');
        return { data: [] };
      }

      setIsLoading(true);
      setError(null);

      try {
        return await generateQuestions(
          { apiKey: aiApiKey, model: aiModel },
          jobDescription,
          resumeText,
          criteria,
          historicalInterviewReviews
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : '生成面试问题失败');
        return { data: [] };
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
      meetingNotesContext?: string,
      codingChallenges?: CodingChallenge[]
    ): Promise<AIResultWithUsage<InterviewResult> | null> => {
      if (!aiApiKey) {
        setError('未配置 AI API Key');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        return await generateSummary(
          { apiKey: aiApiKey, model: aiModel },
          questions,
          jobDescription,
          resumeText,
          candidateName,
          positionTitle,
          quickNotes,
          meetingNotesContext,
          codingChallenges
        );
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
    ): Promise<AIResultWithUsage<MeetingNotesExtractionResult> | null> => {
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
        return { data: { matchedAnswers: [], newQAs: [] } };
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
