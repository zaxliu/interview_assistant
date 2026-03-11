import type { Candidate, ResumeHighlights } from '@/types';

export const emptyResumeHighlights = (): ResumeHighlights => ({
  summary: '',
  strengths: [],
  risks: [],
  experience: [],
  keywords: [],
});

export const normalizeMarkdownText = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n([*-])\s*\n/g, '\n')
    .replace(/^\s+|\s+$/g, '');

export const sanitizeResumeHighlights = (
  highlights?: Partial<ResumeHighlights> | null
): ResumeHighlights => ({
  summary: highlights?.summary?.trim() || '',
  strengths: (highlights?.strengths || []).map((item) => item.trim()).filter(Boolean),
  risks: (highlights?.risks || []).map((item) => item.trim()).filter(Boolean),
  experience: (highlights?.experience || []).map((item) => item.trim()).filter(Boolean),
  keywords: (highlights?.keywords || []).map((item) => item.trim()).filter(Boolean),
});

export const getPreferredResumeText = (candidate: Candidate): string =>
  candidate.resumeMarkdown?.trim() ||
  candidate.resumeText?.trim() ||
  candidate.resumeRawText?.trim() ||
  '';

export const getRawResumeText = (candidate: Candidate): string =>
  candidate.resumeRawText?.trim() || candidate.resumeText?.trim() || '';
