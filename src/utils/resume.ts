import type { Candidate, ResumeHighlights } from '@/types';

const RESUME_NOISE_TEXT = '当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!';

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
    .replace(new RegExp(`\\n*${RESUME_NOISE_TEXT}\\n*`, 'g'), '\n')
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

const hasOwnField = <K extends keyof Candidate>(candidate: Candidate, field: K): boolean =>
  Object.prototype.hasOwnProperty.call(candidate, field);

export const getPreferredResumeText = (candidate: Candidate): string =>
  hasOwnField(candidate, 'resumeMarkdown')
    ? candidate.resumeMarkdown?.trim() || ''
    : hasOwnField(candidate, 'resumeText')
      ? candidate.resumeText?.trim() || ''
      : candidate.resumeRawText?.trim() || '';

export const getRawResumeText = (candidate: Candidate): string =>
  candidate.resumeRawText?.trim() || candidate.resumeText?.trim() || '';

export const hasImportedResume = (candidate: Candidate): boolean =>
  Boolean(
    getPreferredResumeText(candidate) ||
    getRawResumeText(candidate) ||
    candidate.resumeFilename?.trim()
  );
