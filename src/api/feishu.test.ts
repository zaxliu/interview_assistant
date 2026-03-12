import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewResult } from '@/types';

const sampleResult: InterviewResult = {
  interview_info: {
    interviewer: 'Lewis',
    overall_result: '通过',
    interview_time: '2026-03-12 20:00',
  },
  evaluation_dimensions: [
    {
      dimension: '专业能力',
      score: 4,
      assessment_points: '表现稳定',
    },
  ],
  summary: {
    suggested_level: 'P7',
    comprehensive_score: 4,
    overall_comment: '总体表现良好',
    interview_conclusion: '通过',
    is_strongly_recommended: false,
  },
  additional_info: {
    strengths: ['沟通'],
    concerns: ['系统设计深度'],
    follow_up_questions: ['补充项目细节'],
  },
};

const jsonResponse = (
  body: unknown,
  options: { ok?: boolean; status?: number } = {}
): Response => {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
};

describe('feishu api helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts token from a docx link', async () => {
    const { extractFeishuDocTokenFromUrl } = await import('./feishu');
    expect(
      extractFeishuDocTokenFromUrl('https://horizonrobotics.feishu.cn/docx/CHFNdMLYdowr6dxlYWYcF1L6n6c?from=from_copylink')
    ).toBe('CHFNdMLYdowr6dxlYWYcF1L6n6c');
  });

  it('extracts token from a wiki link', async () => {
    const { extractFeishuDocTokenFromUrl } = await import('./feishu');
    expect(
      extractFeishuDocTokenFromUrl('https://horizonrobotics.feishu.cn/wiki/GBBzwKlxKign1mk751CcGsudnKg')
    ).toBe('GBBzwKlxKign1mk751CcGsudnKg');
  });

  it('returns null for invalid link', async () => {
    const { extractFeishuDocTokenFromUrl } = await import('./feishu');
    expect(extractFeishuDocTokenFromUrl('https://example.com/not-feishu')).toBeNull();
  });

  it('requests docx write scope in OAuth URL', async () => {
    const { getOAuthAuthorizationUrl } = await import('./feishu');
    const url = getOAuthAuthorizationUrl('cli_xxx', 'https://example.com/callback');
    const scope = new URL(url).searchParams.get('scope') || '';
    const scopes = scope.split(' ').filter(Boolean);

    expect(scopes).toContain('calendar:calendar:readonly');
    expect(scopes).toContain('docx:document:readonly');
    expect(scopes).toContain('docx:document');
  });
});

describe('createFeishuDoc', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates and writes document with user token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-user' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(sampleResult, 'Alice', 'Frontend', 'user-token');

    expect(response.success).toBe(true);
    expect(response.docUrl).toBe('https://feishu.cn/docx/doc-user');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feishu/docx/v1/documents');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer user-token',
    });
  });

  it('falls back to tenant token when user token lacks permission', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'permission denied' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-tenant' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(
      sampleResult,
      'Alice',
      'Frontend',
      'user-token',
      'cli_xxx',
      'secret_xxx'
    );

    expect(response.success).toBe(true);
    expect(response.docUrl).toBe('https://feishu.cn/docx/doc-tenant');
    expect(response.message).toContain('自动回退');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feishu/docx/v1/documents');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/feishu/auth/v3/tenant_access_token/internal');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/feishu/docx/v1/documents');
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tenant-token',
    });
  });

  it('does not fallback on non-permission errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 40001, msg: 'invalid parameter' }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(
      sampleResult,
      'Alice',
      'Frontend',
      'user-token',
      'cli_xxx',
      'secret_xxx'
    );

    expect(response.success).toBe(false);
    expect(response.message).toContain('invalid parameter');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails when batch_create returns business error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-user' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 1234, msg: 'invalid block payload' }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(sampleResult, 'Alice', 'Frontend', 'user-token');

    expect(response.success).toBe(false);
    expect(response.message).toContain('写入飞书文档内容失败');
    expect(response.message).toContain('invalid block payload');
  });

  it('returns combined error message when both user and tenant export fail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'permission denied' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 50001, msg: 'tenant write failed' }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(
      sampleResult,
      'Alice',
      'Frontend',
      'user-token',
      'cli_xxx',
      'secret_xxx'
    );

    expect(response.success).toBe(false);
    expect(response.message).toContain('用户 token 导出失败');
    expect(response.message).toContain('回退租户 token 失败');
    expect(response.message).toContain('tenant write failed');
  });
});
