import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPositionDescriptionFromWintalentJD,
  downloadWintalentResumePDF,
  fetchWintalentPositionJD,
  isWintalentInterviewLink,
} from './wintalent';

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

describe('fetchWintalentPositionJD', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns jd payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            jd: {
              postName: 'AI Agent应用工程师',
              workContent: '职责A',
              serviceCondition: '要求B',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    const jd = await fetchWintalentPositionJD('https://www.wintalent.cn/wt/Horizon/kurl?k=abc');
    expect(jd.postName).toBe('AI Agent应用工程师');
    expect(jd.workContent).toBe('职责A');
  });

  it('throws backend message when jd api returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: '无职位JD权限' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      fetchWintalentPositionJD('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('无职位JD权限');
  });
});

describe('wintalent JD helpers', () => {
  it('builds readable position description', () => {
    const text = buildPositionDescriptionFromWintalentJD({
      postName: '【平台】AI Agent应用工程师',
      workPlaceName: '北京市',
      workContent: '1.职责A&br&2.职责B',
      serviceCondition: '1.要求A&br&2.要求B',
    });

    expect(text).toContain('岗位：【平台】AI Agent应用工程师');
    expect(text).toContain('工作职责：');
    expect(text).toContain('2.职责B');
    expect(text).toContain('任职要求：');
  });

  it('detects wintalent interview links', () => {
    expect(isWintalentInterviewLink('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')).toBe(true);
    expect(isWintalentInterviewLink('https://example.com')).toBe(false);
    expect(isWintalentInterviewLink(undefined)).toBe(false);
  });
});
