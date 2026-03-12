import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadWintalentResumePDF } from './wintalent';

describe('downloadWintalentResumePDF', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads PDF and parses UTF-8 filename from content-disposition', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': "inline; filename*=UTF-8''%E7%AE%80%E5%8E%86.pdf",
      'x-wintalent-pdf-url': 'https://www.wintalent.cn/interviewer/interviewPlatform/getResumeOriginalInfo?...',
      'x-wintalent-resume-id': '3293935',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(blob, {
          status: 200,
          headers,
        })
      )
    );

    const result = await downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc');
    expect(result.filename).toBe('简历.pdf');
    expect(result.resumeId).toBe('3293935');
    expect(result.resolvedPdfUrl).toContain('getResumeOriginalInfo');
  });

  it('throws structured error from backend response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'token expired' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('token expired');
  });
});
