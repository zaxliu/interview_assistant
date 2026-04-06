import { useState, useCallback } from 'react';
import { analyzeSummaryRewrite, extractMeetingNotesInsights, generateQuestions, generateSummary } from '@/api/ai';
import { useSettingsStore } from '@/store/settingsStore';
import type { Question, InterviewResult, CodingChallenge, HistoricalInterviewReview } from '@/types';
import type { AIResultWithUsage, MeetingNotesExtractionResult, SummaryRewriteInsight } from '@/api/ai';
import { reportError } from '@/lib/analytics';

export const useAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { aiApiKey, aiModel } = useSettingsStore();

  const generateInterviewQuestions = useCallback(
    async (
      jobDescription: string,
      resumeText: string,
      criteria: string[],
      historicalInterviewReviews?: HistoricalInterviewReview[],
      guidance?: string
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
          historicalInterviewReviews,
          guidance
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成面试问题失败';
        setError(message);
        reportError({
          error: err,
          feature: 'question_generation',
          errorCategory: 'ai',
          model: aiModel,
          requestContext: {
            endpoint: '/api/ai/chat/completions',
            method: 'POST',
            provider: 'openai-compatible',
            model: aiModel,
            operation: 'generate_questions',
          },
          reproContext: {
            route: window.location.pathname,
          },
          inputSnapshot: {
            criteriaCount: criteria.length,
            hasJobDescription: Boolean(jobDescription.trim()),
            resumeLength: resumeText.length,
            historicalReviewCount: historicalInterviewReviews?.length || 0,
          },
        });
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
      codingChallenges?: CodingChallenge[],
      guidance?: string
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
          codingChallenges,
          guidance
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成面试总结失败';
        setError(message);
        reportError({
          error: err,
          feature: 'summary_generation',
          errorCategory: 'ai',
          model: aiModel,
          requestContext: {
            endpoint: '/api/ai/chat/completions',
            method: 'POST',
            provider: 'openai-compatible',
            model: aiModel,
            operation: 'generate_summary',
          },
          reproContext: {
            route: window.location.pathname,
          },
          inputSnapshot: {
            candidateName,
            positionTitle,
            questionCount: questions.length,
            askedQuestionCount: questions.filter((question) => question.status === 'asked').length,
            hasMeetingNotesContext: Boolean(meetingNotesContext?.trim()),
            codingChallengeCount: codingChallenges?.length || 0,
          },
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [aiApiKey, aiModel]
  );

  const analyzeInterviewSummaryRewrite = useCallback(
    async (
      generatedSummaryDraft: InterviewResult,
      finalSummary: InterviewResult
    ): Promise<AIResultWithUsage<SummaryRewriteInsight> | null> => {
      if (!aiApiKey) {
        return null;
      }

      try {
        return await analyzeSummaryRewrite(
          { apiKey: aiApiKey, model: aiModel },
          generatedSummaryDraft,
          finalSummary
        );
      } catch {
        return null;
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
        const message = err instanceof Error ? err.message : '提取会议纪要洞察失败';
        setError(message);
        reportError({
          error: err,
          feature: 'meeting_notes_extraction',
          errorCategory: 'ai',
          model: aiModel,
          requestContext: {
            endpoint: '/api/ai/chat/completions',
            method: 'POST',
            provider: 'openai-compatible',
            model: aiModel,
            operation: 'extract_meeting_notes',
          },
          reproContext: {
            route: window.location.pathname,
          },
          inputSnapshot: {
            questionCount: existingQuestions.length,
            meetingNotesLength: meetingNotesContent.length,
          },
        });
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
    analyzeInterviewSummaryRewrite,
    extractInterviewNotesInsights,
  };
};
