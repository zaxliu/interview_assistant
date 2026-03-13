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

  it('creates, writes, and sets tenant-readable permission with user token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-user' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(sampleResult, 'Alice', 'Frontend', 'user-token');

    expect(response.success).toBe(true);
    expect(response.docUrl).toBe('https://feishu.cn/docx/doc-user');
    expect(response.message).toContain('企业内获链可读');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/feishu/docx/v1/documents');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/feishu/docx/v1/documents/doc-user/blocks/doc-user/children');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/feishu/drive/v1/permissions/doc-user/public?type=docx');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer user-token',
    });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'PATCH' });
    const writeBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(writeBody.children[0].block_type).toBe(4); // heading2
    expect(
      writeBody.children.some(
        (block: { block_type: number; heading3?: unknown }) => block.block_type === 5 && Boolean(block.heading3)
      )
    ).toBe(true);
    const permissionBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(permissionBody).toEqual({ link_share_entity: 'tenant_readable' });
  });

  it('falls back to tenant token when user token lacks permission', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'permission denied' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-tenant' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
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
    expect(fetchMock.mock.calls[3][0]).toBe('/api/feishu/docx/v1/documents/doc-tenant/blocks/doc-tenant/children');
    expect(fetchMock.mock.calls[4][0]).toBe('/api/feishu/drive/v1/permissions/doc-tenant/public?type=docx');
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tenant-token',
    });
    expect((fetchMock.mock.calls[4][1] as RequestInit).headers).toMatchObject({
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

  it('fails when writing doc blocks returns business error', async () => {
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

  it('returns success with warning when permission update fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { document: { document_id: 'doc-user' } } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0 }))
      .mockResolvedValueOnce(jsonResponse({ code: 1770001, msg: 'invalid param' }, { ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { createFeishuDoc } = await import('./feishu');
    const response = await createFeishuDoc(sampleResult, 'Alice', 'Frontend', 'user-token');

    expect(response.success).toBe(true);
    expect(response.docUrl).toBe('https://feishu.cn/docx/doc-user');
    expect(response.message).toContain('自动设置“企业内获链可读”失败');
    expect(response.message).toContain('invalid param');
  });
});

describe('syncInterviewsFromCalendar', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses past and future window when syncing events', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            calendar_list: [
              { calendar_id: 'cal-1', summary: '主日历', type: 'primary' },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [
              {
                event_id: 'evt-1',
                summary: '面试安排：李雷(【平台】前端工程师)',
                status: 'confirmed',
                start_time: { timestamp: `${Math.floor(Date.parse('2026-03-14T08:00:00.000Z') / 1000)}` },
                end_time: { timestamp: `${Math.floor(Date.parse('2026-03-14T09:00:00.000Z') / 1000)}` },
              },
            ],
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { syncInterviewsFromCalendar } = await import('./feishu');
    const result = await syncInterviewsFromCalendar(
      { pastDays: 7, futureDays: 30 },
      'user-token'
    );

    const eventsCallUrl = new URL(String(fetchMock.mock.calls[1][0]), 'https://example.com');
    const startTime = Number(eventsCallUrl.searchParams.get('start_time'));
    const endTime = Number(eventsCallUrl.searchParams.get('end_time'));

    const expectedStart = Math.floor(Date.parse('2026-03-06T08:00:00.000Z') / 1000);
    const expectedEnd = Math.floor(Date.parse('2026-04-12T08:00:00.000Z') / 1000);

    expect(startTime).toBe(expectedStart);
    expect(endTime).toBe(expectedEnd);
    expect(result.events).toHaveLength(1);
    expect(result.positions.size).toBe(1);
  });

  it('keeps numeric argument backward compatible', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            calendar_list: [
              { calendar_id: 'cal-1', summary: '主日历', type: 'primary' },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { items: [] },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { syncInterviewsFromCalendar } = await import('./feishu');
    await syncInterviewsFromCalendar(30, 'user-token');

    const eventsCallUrl = new URL(String(fetchMock.mock.calls[1][0]), 'https://example.com');
    const startTime = Number(eventsCallUrl.searchParams.get('start_time'));
    const endTime = Number(eventsCallUrl.searchParams.get('end_time'));

    const expectedStart = Math.floor(Date.parse('2026-03-13T08:00:00.000Z') / 1000);
    const expectedEnd = Math.floor(Date.parse('2026-04-12T08:00:00.000Z') / 1000);

    expect(startTime).toBe(expectedStart);
    expect(endTime).toBe(expectedEnd);
  });
});
