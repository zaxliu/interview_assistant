import { describe, expect, it } from 'vitest';
import { emptyResumeHighlights, getPreferredResumeText, normalizeMarkdownText, sanitizeResumeHighlights } from './resume';

describe('resume utils', () => {
  it('prefers normalized markdown over legacy resume text', () => {
    expect(
      getPreferredResumeText({
        id: 'c1',
        name: 'Alice',
        status: 'pending',
        questions: [],
        resumeText: 'legacy',
        resumeMarkdown: 'normalized',
      })
    ).toBe('normalized');
  });

  it('normalizes excessive blank lines', () => {
    expect(normalizeMarkdownText('A\n\n\n\nB')).toBe('A\n\nB');
  });

  it('sanitizes highlight lists', () => {
    expect(
      sanitizeResumeHighlights({
        summary: ' summary ',
        strengths: [' React ', ''],
      })
    ).toEqual({
      ...emptyResumeHighlights(),
      summary: 'summary',
      strengths: ['React'],
    });
  });
});
