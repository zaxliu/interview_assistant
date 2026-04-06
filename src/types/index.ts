// User info from Feishu
export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  loginTime: string;
}

// Calendar Event from Feishu
export interface CalendarEvent {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  meetLink?: string;
  parsedTitle?: ParsedTitle;
}

export interface ParsedTitle {
  candidateName: string;
  team: string;
  position: string;
}

// Position (Job)
export interface Position {
  id: string;
  title: string;
  team?: string;
  description?: string;
  criteria: string[];
  createdAt: string;
  source: 'calendar' | 'manual';
  candidates: Candidate[];
  feedbackEvents?: FeedbackEvent[];
  generationGuidance?: GenerationGuidance;
  userId?: string; // Owner of this position
}

export interface ResumeHighlights {
  summary: string;
  strengths: string[];
  risks: string[];
  experience: string[];
  keywords: string[];
}

export interface HistoricalInterviewReview {
  id: string;
  source?: 'wintalent';
  stageName?: string;
  interviewer?: string;
  interviewTime?: string;
  result?: string;
  summary: string;
  rawText?: string;
}

export interface AIUsage {
  input: number;
  cached: number;
  output: number;
}

export interface CandidateAIUsage {
  resumeOCR?: AIUsage;
  resumeProcessing?: AIUsage;
  questionGeneration?: AIUsage;
  meetingNotesExtraction?: AIUsage;
}

// Candidate
export interface Candidate {
  id: string;
  name: string;
  resumeText?: string;
  resumeRawText?: string;
  resumeViewerMode?: 'pdf' | 'html';
  resumeMarkdown?: string;
  resumeHighlights?: ResumeHighlights;
  historicalInterviewReviews?: HistoricalInterviewReview[];
  resumeFilename?: string;
  resumeUrl?: string;
  interviewLink?: string;
  candidateLink?: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  calendarEventId?: string;
  interviewTime?: string;
  questions: Question[];
  quickNotes?: string;
  meetingNotesContext?: string;
  codingChallenges?: CodingChallenge[];
  interviewResult?: InterviewResult;
  aiUsage?: CandidateAIUsage;
  lastQuestionBatchId?: string;
  lastGeneratedSummaryDraft?: InterviewResult;
  userId?: string; // Owner of this candidate
}

export interface GenerationGuidance {
  questionGuidance: string;
  summaryGuidance: string;
  updatedAt: string;
  sampleSize: number;
}

export type FeedbackEventType =
  | 'question_asked'
  | 'question_deleted'
  | 'question_edited'
  | 'summary_rewritten';

export interface FeedbackEvent {
  id: string;
  type: FeedbackEventType;
  createdAt: string;
  candidateId: string;
  questionId?: string;
  details?: Record<string, string | number | boolean | string[]>;
}

// Question source type
export type QuestionSource = 'resume' | 'jd' | 'common' | 'coding';

// Evaluation dimension name type (for dimension names like '专业能力', '适配度', '管理能力')
export type EvaluationDimensionName = '专业能力' | '通用素质' | '适配度' | '管理能力';

// Question
export interface Question {
  id: string;
  text: string;
  source: QuestionSource;  // Where the question comes from
  evaluationDimension?: EvaluationDimensionName;  // Which evaluation dimension this question assesses
  context?: string;  // The text from resume/JD that this question is based on (for highlighting in PDF)
  historicalReviewSummary?: string;
  isAIGenerated: boolean;
  aiBatchId?: string;
  originalText?: string;
  notes?: string;
  status: 'asked' | 'skipped' | 'not_reached';
  // Keep category for backward compatibility, will be deprecated
  category?: string;
}

// Coding Challenge
export interface CodingChallenge {
  id: string;
  problem: string;
  solution?: string;
  evaluation?: {
    timeComplexity?: 'excellent' | 'good' | 'acceptable' | 'needs_improvement';
    codeQuality?: 'excellent' | 'good' | 'acceptable' | 'needs_improvement';
    communication?: 'excellent' | 'good' | 'acceptable' | 'needs_improvement';
  };
  result: 'pass' | 'partial' | 'fail' | 'not_completed';
}

// Interview Result - matches export format
export interface InterviewResult {
  interview_info: {
    interviewer: string;
    overall_result: '通过' | '不通过' | '待定';
    interview_time: string;
  };
  evaluation_dimensions: EvaluationDimension[];
  summary: {
    suggested_level: string;
    comprehensive_score: number;
    overall_comment: string;
    interview_conclusion: '通过' | '不通过' | '待定';
    is_strongly_recommended: boolean;
  };
  additional_info?: {
    strengths?: string[];
    concerns?: string[];
    follow_up_questions?: string[];
  };
  aiUsage?: {
    summaryGeneration?: AIUsage;
    summaryRewriteAnalysis?: AIUsage;
  };
}

export interface EvaluationDimension {
  dimension: string;
  score: number;
  assessment_points: string;
}

// Settings
export interface Settings {
  aiApiKey: string;
  aiModel: string;
  feishuAppId: string;
  feishuAppSecret: string;
  feishuUserAccessToken: string;
  feishuRefreshToken: string;
}

// AI Request/Response types
export interface GenerateQuestionsRequest {
  jobDescription: string;
  resumeText: string;
  criteria: string[];
}

export interface GenerateSummaryRequest {
  questions: Question[];
  jobDescription: string;
  resumeText: string;
  candidateName: string;
  positionTitle: string;
}
