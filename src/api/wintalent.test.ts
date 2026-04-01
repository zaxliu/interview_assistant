import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autofillWintalentEvaluationDraft,
  buildPositionDescriptionFromWintalentJD,
  fetchFirstAvailableWintalentPositionJD,
  downloadWintalentResumePDF,
  fetchWintalentCandidateData,
  fetchWintalentPositionJD,
  fetchWintalentResumeText,
  isWintalentInterviewLink,
} from './wintalent';

const sampleInterviewResult = {
  interview_info: {
    interviewer: 'Lewis',
    overall_result: '通过' as const,
    interview_time: '2026-03-27 10:00',
  },
  evaluation_dimensions: [
    { dimension: '专业能力', score: 4, assessment_points: '扎实' },
  ],
  summary: {
    suggested_level: 'P7',
    comprehensive_score: 4,
    overall_comment: '整体较强',
    interview_conclusion: '通过' as const,
    is_strongly_recommended: true,
  },
};

describe('downloadWintalentResumePDF', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads PDF and parses UTF-8 filename from content-disposition', async () => {
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': "inline; filename*=UTF-8''%E7%AE%80%E5%8E%86.pdf",
      'x-wintalent-pdf-url': 'https://www.wintalent.cn/interviewer/interviewPlatform/getResumeOriginalInfo?...',
      'x-wintalent-resume-id': '3293935',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('%PDF-1.7', {
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

  it('shows clear hint when local wintalent proxy is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Error: connect ECONNREFUSED 127.0.0.1:8787', {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('Wintalent 代理服务不可用');
  });

  it('extracts resume-unavailable hint from failed text response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!', {
          status: 400,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!');
  });

  it('maps missing original resume permission to a user-facing hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            code: 'NO_ORIGINAL_RESUME_PERMISSION',
            error: '未拿到 resumeOriginalInfoUrl，可能无原始简历权限',
          }),
          {
          status: 403,
          headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('当前链接没有原始简历查看权限，暂时无法一键导入');
  });

  it('maps structured link-expired code to a user-facing hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            code: 'LINK_EXPIRED',
            error: 'showResume 链接可能已失效',
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('Wintalent 链接可能已失效，请重新进入面试链接后再试。');
  });

  it('extracts resume-unavailable hint from non-pdf success payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    );

    await expect(
      downloadWintalentResumePDF('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!');
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

  it('converts fetch network error to actionable proxy hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      fetchWintalentPositionJD('https://www.wintalent.cn/wt/Horizon/kurl?k=abc')
    ).rejects.toThrow('Wintalent 代理服务不可用');
  });
});

describe('autofillWintalentEvaluationDraft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns evaluation url when draft autofill succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            evaluationUrl: 'https://www.wintalent.cn/interviewer/interviewPlatform/newpc/jsp/interviewEvaluation.html?x=1',
            candidateLinkUrl: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    await expect(
      autofillWintalentEvaluationDraft('https://www.wintalent.cn/wt/Horizon/kurl?k=abc', sampleInterviewResult)
    ).resolves.toEqual({
      evaluationUrl: 'https://www.wintalent.cn/interviewer/interviewPlatform/newpc/jsp/interviewEvaluation.html?x=1',
      candidateLinkUrl: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
    });
  });

  it('throws backend error when draft autofill fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: '自动暂存失败' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      autofillWintalentEvaluationDraft('https://www.wintalent.cn/wt/Horizon/kurl?k=abc', sampleInterviewResult)
    ).rejects.toThrow('自动暂存失败');
  });
});

describe('fetchFirstAvailableWintalentPositionJD', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tries subsequent wintalent links when the first one fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: false, error: '无职位JD权限' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: true,
              jd: {
                postName: 'AI Agent应用工程师',
                workContent: '职责A',
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
    );

    const result = await fetchFirstAvailableWintalentPositionJD([
      'https://www.wintalent.cn/wt/Horizon/kurl?k=first',
      'https://www.wintalent.cn/wt/Horizon/kurl?k=second',
    ]);

    expect(result.link).toBe('https://www.wintalent.cn/wt/Horizon/kurl?k=second');
    expect(result.jd.postName).toBe('AI Agent应用工程师');
  });
});

describe('fetchWintalentCandidateData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns historical interview reviews on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            historicalInterviewReviews: [
              {
                id: 'review-1',
                stageName: '一面',
                result: '通过',
                summary: '沟通顺畅，项目经验扎实。',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    const result = await fetchWintalentCandidateData('https://www.wintalent.cn/wt/Horizon/kurl?k=abc');
    expect(result.historicalInterviewReviews).toHaveLength(1);
    expect(result.historicalInterviewReviews[0]).toMatchObject({
      stageName: '一面',
      result: '通过',
    });
  });
});

describe('fetchWintalentResumeText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns standard resume text payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            text: '自我评价\n工作经历',
            resumeId: '3540827',
            source: 'html',
            title: 'Wintalent 标准简历',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    const result = await fetchWintalentResumeText('https://www.wintalent.cn/wt/Horizon/kurl?k=abc');
    expect(result).toMatchObject({
      text: '自我评价\n工作经历',
      resumeId: '3540827',
      source: 'html',
      title: 'Wintalent 标准简历',
    });
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
