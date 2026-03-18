import type { CalendarEvent, InterviewResult, User } from '@/types';
import { parseEventTitle, isInterviewEvent, extractLinksFromDescription } from '@/utils/titleParser';

interface FeishuToken {
  accessToken: string;
  expireTime: number;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let cachedToken: FeishuToken | null = null;

/**
 * Generate OAuth authorization URL.
 * Includes calendar + docx read/write scopes for sync, meeting-notes import and export.
 */
export const getOAuthAuthorizationUrl = (
  appId: string,
  redirectUri: string,
  state?: string
): string => {
  // Space-separated scopes, following Feishu OAuth convention.
  const scope = 'calendar:calendar:readonly docx:document:readonly docx:document';

  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state: state || 'feishu_oauth',
    scope: scope,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
};

/**
 * Exchange authorization code for access token
 * Uses the v2 OAuth endpoint
 */
export const exchangeCodeForToken = async (
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<OAuthTokens> => {
  // Use proxy endpoint
  const url = '/api/feishu/authen/v2/oauth/token';

  console.log('Exchanging code for token at:', url);
  console.log('Request params:', { grant_type: 'authorization_code', redirect_uri: redirectUri, client_id: appId });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OAuth token exchange error:', errorText);
    throw new Error(`通过授权码换取 token 失败：${response.status}`);
  }

  const data = await response.json();
  console.log('Token exchange response:', data);

  if (data.code !== 0) {
    const errorMsg = data.msg || '获取 access token 失败';
    console.error('Feishu API error:', data.code, errorMsg);
    throw new Error(`${errorMsg} (code: ${data.code})`);
  }

  // Response structure: { code: 0, access_token: '...', refresh_token: '...', ... }
  if (!data.access_token) {
    console.error('No access_token in response:', data);
    throw new Error('响应中缺少 access token');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in || 7200,
  };
};

/**
 * Refresh access token using refresh token
 * Uses the v2 OAuth endpoint
 */
export const refreshAccessToken = async (
  refreshToken: string,
  appId: string,
  appSecret: string
): Promise<OAuthTokens> => {
  const url = '/api/feishu/authen/v2/oauth/token';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appId,
      client_secret: appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token refresh error:', errorText);
    throw new Error(`刷新 token 失败：${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(data.msg || '刷新 access token 失败');
  }

  // Response structure: { code: 0, access_token: '...', refresh_token: '...', ... }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in || 7200,
  };
};

/**
 * Get user info from Feishu using user access token
 */
export const getUserInfo = async (
  userAccessToken: string
): Promise<User> => {
  const url = '/api/feishu/authen/v1/user_info';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Get user info error:', errorText);
    throw new Error(`获取用户信息失败：${response.status}`);
  }

  const data = await response.json();
  console.log('User info response:', data);

  if (data.code !== 0) {
    throw new Error(data.msg || '获取用户信息失败');
  }

  // Response structure: { code: 0, data: { user_id, name, avatar_url, ... } }
  const userData = data.data;
  return {
    id: userData.user_id || userData.open_id || '',
    name: userData.name || '未知用户',
    avatarUrl: userData.avatar_url || userData.avatar_thumb || undefined,
    loginTime: new Date().toISOString(),
  };
};

/**
 * Get access token - either use provided user_access_token or get tenant_access_token
 */
const getAccessToken = async (
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<string> => {
  // If user_access_token is provided, use it directly
  if (userAccessToken) {
    return userAccessToken;
  }

  // Otherwise, get tenant_access_token using app credentials
  if (!appId || !appSecret) {
    throw new Error('请提供 user_access_token 或 app_id + app_secret');
  }

  // Check cache
  if (cachedToken && cachedToken.expireTime > Date.now()) {
    return cachedToken.accessToken;
  }

  try {
    const response = await fetch('/api/feishu/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    });

    if (!response.ok) {
      if (response.type === 'opaque' || response.status === 0) {
        throw new Error('CORS 错误：浏览器无法直接访问飞书 API，请检查代理配置。');
      }
      const errorText = await response.text();
      console.error('Token API error response:', errorText);
      throw new Error(`获取飞书 access token 失败：${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(data.msg || '获取飞书 access token 失败');
    }

    cachedToken = {
      accessToken: data.tenant_access_token,
      expireTime: Date.now() + (data.expire - 300) * 1000, // 5 minutes buffer
    };

    return cachedToken.accessToken;
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('网络错误：无法连接飞书 API，请检查网络连接。');
    }
    throw error;
  }
};

/**
 * Get calendar events from Feishu - fetches from ALL calendars
 */
export const getCalendarEvents = async (
  startDate: Date,
  endDate: Date,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<CalendarEvent[]> => {
  const accessToken = await getAccessToken(userAccessToken, appId, appSecret);

  // Get ALL calendars
  const calendarsUrl = '/api/feishu/calendar/v4/calendars';

  console.log('Fetching ALL calendars from:', calendarsUrl);

  const calendarsResponse = await fetch(calendarsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!calendarsResponse.ok) {
    throw new Error('获取日历列表失败');
  }

  const calendarsData = await calendarsResponse.json();
  if (calendarsData.code !== 0) {
    throw new Error(calendarsData.msg || '获取日历列表失败');
  }

  const calendars = calendarsData.data?.calendar_list || [];
  console.log(`Found ${calendars.length} calendars to search:`);
  calendars.forEach((cal: Record<string, unknown>) => {
    console.log(`  - ${cal.summary} (${cal.type})`);
  });

  // Convert dates to Unix timestamp in SECONDS (Feishu API expects seconds)
  const startTime = Math.floor(startDate.getTime() / 1000);
  const endTime = Math.floor(endDate.getTime() / 1000);

  console.log('Time range:', {
    start: new Date(startTime * 1000).toISOString(),
    end: new Date(endTime * 1000).toISOString(),
  });

  // Fetch events from ALL calendars
  const allEvents: Record<string, unknown>[] = [];

  for (const calendar of calendars) {
    const calendarId = calendar.calendar_id as string;
    const calendarName = calendar.summary as string;

    const url = `/api/feishu/calendar/v4/calendars/${calendarId}/events?start_time=${startTime}&end_time=${endTime}`;

    console.log(`Fetching events from calendar: ${calendarName}...`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(`  Failed to fetch from ${calendarName}: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.code !== 0) {
        console.log(`  Error from ${calendarName}: ${data.msg}`);
        continue;
      }

      const events = data.data?.items || [];
      console.log(`  Found ${events.length} events in ${calendarName}`);

      // Add calendar info to each event
      events.forEach((event: Record<string, unknown>) => {
        event._calendar_name = calendarName;
        event._calendar_id = calendarId;
      });

      allEvents.push(...events);
    } catch (err) {
      console.log(`  Error fetching from ${calendarName}:`, err);
    }
  }

  console.log(`Total events from all calendars: ${allEvents.length}`);

  // Sort events by start time
  const sortedEvents = [...allEvents].sort((a, b) => {
    const aTime = (a.start_time as Record<string, unknown>)?.timestamp;
    const bTime = (b.start_time as Record<string, unknown>)?.timestamp;
    return (parseInt(aTime as string || '0') - parseInt(bTime as string || '0'));
  });

  // Log ALL events with details
  console.log('=== ALL EVENTS FROM ALL CALENDARS (sorted by time) ===');
  sortedEvents.forEach((event: Record<string, unknown>, index: number) => {
    const summary = event.summary as string || '(no title)';
    const status = event.status as string || 'unknown';
    const startTime = event.start_time as Record<string, unknown>;
    const endTime = event.end_time as Record<string, unknown>;
    const timestamp = startTime?.timestamp as string;
    const endTimestamp = endTime?.timestamp as string;
    const description = event.description as string || '';
    const location = event.location as Record<string, unknown>;
    const organizer = event.event_organizer as Record<string, unknown>;
    const calendarName = event._calendar_name as string;

    // Convert timestamp to date
    let dateStr = '(no date)';
    let endStr = '';
    if (timestamp) {
      const date = new Date(parseInt(timestamp) * 1000);
      dateStr = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    if (endTimestamp) {
      const endDate = new Date(parseInt(endTimestamp) * 1000);
      endStr = ' - ' + endDate.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
    }

    const isCancelled = status === 'cancelled';
    const isInterview = summary.includes('面试') || summary.startsWith('面试安排');

    let prefix = '';
    if (isCancelled) prefix = '❌ ';
    else if (isInterview) prefix = '🔴 ';

    console.log(`${index + 1}. [${dateStr}${endStr}] ${prefix}${summary}`);
    console.log(`   Calendar: ${calendarName} | Status: ${status}`);
    if (organizer?.display_name) {
      console.log(`   Organizer: ${organizer.display_name}`);
    } else {
      console.log(`   Organizer: (system/none)`);
    }
    if (location?.name) {
      console.log(`   Location: ${location.name}`);
    }
    if (description) {
      console.log(`   Description: ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}`);
    }
    if (isInterview) {
      console.log(`   FULL DETAILS:`, JSON.stringify(event, null, 2));
    }
  });
  console.log('=== END OF ALL EVENTS ===');

  // Filter out cancelled events
  const activeEvents = sortedEvents.filter((event: Record<string, unknown>) => {
    const status = event.status as string;
    return status !== 'cancelled';
  });
  console.log(`Found ${activeEvents.length} active events (excluding cancelled)`);

  const events: CalendarEvent[] = activeEvents.map((event: Record<string, unknown>) => {
    const title = event.summary as string || '';
    const isInterview = isInterviewEvent(title);
    const parsed = isInterview ? parseEventTitle(title) : null;
    const parsedTitle = parsed || undefined;

    if (isInterview) {
      console.log(`Interview event found: "${title}" -> parsed:`, parsedTitle);
    }

    // Extract timestamp from start_time/end_time objects and convert to ISO string
    const startTimeObj = event.start_time as Record<string, unknown> | undefined;
    const endTimeObj = event.end_time as Record<string, unknown> | undefined;
    const startTimestamp = startTimeObj?.timestamp as string | undefined;
    const endTimestamp = endTimeObj?.timestamp as string | undefined;

    // Convert Unix timestamp (seconds) to ISO string
    const startTimeIso = startTimestamp
      ? new Date(parseInt(startTimestamp) * 1000).toISOString()
      : '';
    const endTimeIso = endTimestamp
      ? new Date(parseInt(endTimestamp) * 1000).toISOString()
      : '';

    return {
      eventId: event.event_id as string,
      title,
      startTime: startTimeIso,
      endTime: endTimeIso,
      description: event.description as string | undefined,
      meetLink: event.hangout_link as string | undefined,
      parsedTitle,
    };
  });

  // Filter to only interview events
  return events.filter((event) => event.parsedTitle);
};

/**
 * Sync interviews from Feishu Calendar
 * Returns events that match the interview pattern
 */
export interface SyncCalendarWindow {
  pastDays?: number;
  futureDays?: number;
}

const normalizeSyncWindow = (
  syncWindow: number | SyncCalendarWindow | undefined
): Required<SyncCalendarWindow> => {
  if (typeof syncWindow === 'number') {
    return {
      pastDays: 0,
      futureDays: Math.max(0, Math.floor(syncWindow)),
    };
  }

  return {
    pastDays: Math.max(0, Math.floor(syncWindow?.pastDays ?? 0)),
    futureDays: Math.max(0, Math.floor(syncWindow?.futureDays ?? 30)),
  };
};

export const syncInterviewsFromCalendar = async (
  syncWindow: number | SyncCalendarWindow = 30,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<{
  events: CalendarEvent[];
  positions: Map<string, { title: string; team: string }>;
}> => {
  const { pastDays, futureDays } = normalizeSyncWindow(syncWindow);
  const now = new Date();
  const startDate = new Date(now);
  const endDate = new Date(now);
  startDate.setDate(startDate.getDate() - pastDays);
  endDate.setDate(endDate.getDate() + futureDays);

  const events = await getCalendarEvents(startDate, endDate, userAccessToken, appId, appSecret);

  // Group by position
  const positions = new Map<string, { title: string; team: string }>();
  events.forEach((event) => {
    if (event.parsedTitle) {
      const key = `${event.parsedTitle.team}-${event.parsedTitle.position}`;
      if (!positions.has(key)) {
        positions.set(key, {
          title: event.parsedTitle.position,
          team: event.parsedTitle.team,
        });
      }
    }
  });

  return { events, positions };
};

/**
 * Create a Feishu Doc with interview result
 */
interface FeishuApiError extends Error {
  status?: number;
  code?: number | string;
}

const toObjectRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
};

const toFeishuApiError = (
  error: unknown,
  fallbackMessage: string
): FeishuApiError => {
  if (error instanceof Error) {
    return error as FeishuApiError;
  }
  return new Error(fallbackMessage) as FeishuApiError;
};

const extractFeishuCode = (payload: Record<string, unknown> | null): number | string | undefined => {
  if (!payload) {
    return undefined;
  }
  const code = payload.code;
  if (typeof code === 'number' || typeof code === 'string') {
    return code;
  }
  return undefined;
};

const extractFeishuMessage = (
  payload: Record<string, unknown> | null,
  fallbackMessage: string
): string => {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload.msg === 'string' && payload.msg.trim()) {
    return payload.msg.trim();
  }

  const nestedError = toObjectRecord(payload.error);
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.trim()) {
    return nestedError.message.trim();
  }

  return fallbackMessage;
};

const formatFeishuMessageWithCode = (
  payload: Record<string, unknown> | null,
  fallbackMessage: string
): string => {
  const message = extractFeishuMessage(payload, fallbackMessage);
  const code = extractFeishuCode(payload);
  if (code !== undefined) {
    return `${message} (code: ${code})`;
  }
  return message;
};

const createFeishuApiError = (
  message: string,
  status?: number,
  code?: number | string
): FeishuApiError => {
  const error = new Error(message) as FeishuApiError;
  error.status = status;
  error.code = code;
  return error;
};

const isPermissionRelatedError = (error: FeishuApiError): boolean => {
  if (error.status === 401 || error.status === 403) {
    return true;
  }

  const scope = `${String(error.code ?? '')} ${error.message}`.toLowerCase();
  const permissionKeywords = [
    'permission',
    'forbidden',
    'scope',
    'unauthorized',
    'access denied',
    'no permission',
    'insufficient scope',
    '无权限',
    '权限不足',
    '没有权限',
    '访问被拒绝',
  ];

  return permissionKeywords.some((keyword) => scope.includes(keyword));
};

const enableTenantReadableLinkShare = async (
  accessToken: string,
  documentId: string
): Promise<string | null> => {
  const response = await fetch(`/api/feishu/drive/v1/permissions/${documentId}/public?type=docx`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      link_share_entity: 'tenant_readable',
    }),
  });
  const payload = toObjectRecord(await response.json().catch(() => null));

  if (!response.ok) {
    return `设置共享权限失败：${formatFeishuMessageWithCode(payload, `HTTP ${response.status}`)} (HTTP ${response.status})`;
  }

  const code = extractFeishuCode(payload);
  if (code !== 0) {
    return `设置共享权限失败：${formatFeishuMessageWithCode(payload, '未知飞书 API 错误')}`;
  }

  return null;
};

const createFeishuDocWithToken = async (
  accessToken: string,
  result: InterviewResult,
  candidateName: string,
  positionTitle: string,
  shouldEnableTenantReadableLinkShare = false
): Promise<{ documentId: string; permissionWarning?: string }> => {
  const createResponse = await fetch('/api/feishu/docx/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `面试结果 - ${candidateName} - ${positionTitle}`,
    }),
  });
  const createPayload = toObjectRecord(await createResponse.json().catch(() => null));

  if (!createResponse.ok) {
    const code = extractFeishuCode(createPayload);
    throw createFeishuApiError(
      `创建飞书文档失败：${formatFeishuMessageWithCode(createPayload, `HTTP ${createResponse.status}`)} (HTTP ${createResponse.status})`,
      createResponse.status,
      code
    );
  }

  const createCode = extractFeishuCode(createPayload);
  if (createCode !== 0) {
    throw createFeishuApiError(
      `创建飞书文档失败：${formatFeishuMessageWithCode(createPayload, '未知飞书 API 错误')}`,
      createResponse.status,
      createCode
    );
  }

  const createData = toObjectRecord(createPayload?.data);
  const document = toObjectRecord(createData?.document);
  const documentIdRaw = document?.document_id;
  if (typeof documentIdRaw !== 'string' || !documentIdRaw.trim()) {
    throw createFeishuApiError('创建飞书文档失败：响应中缺少 document_id');
  }
  const documentId = documentIdRaw.trim();

  const blocks = formatResultAsBlocks(result);
  const batchResponse = await fetch(`/api/feishu/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      children: blocks,
      index: 0,
    }),
  });
  const batchPayload = toObjectRecord(await batchResponse.json().catch(() => null));

  if (!batchResponse.ok) {
    const code = extractFeishuCode(batchPayload);
    throw createFeishuApiError(
      `写入飞书文档内容失败：${formatFeishuMessageWithCode(batchPayload, `HTTP ${batchResponse.status}`)} (HTTP ${batchResponse.status})`,
      batchResponse.status,
      code
    );
  }

  const batchCode = extractFeishuCode(batchPayload);
  if (batchCode !== 0) {
    throw createFeishuApiError(
      `写入飞书文档内容失败：${formatFeishuMessageWithCode(batchPayload, '未知飞书 API 错误')}`,
      batchResponse.status,
      batchCode
    );
  }

  if (shouldEnableTenantReadableLinkShare) {
    const permissionWarning = await enableTenantReadableLinkShare(accessToken, documentId);
    if (permissionWarning) {
      return {
        documentId,
        permissionWarning,
      };
    }
  }

  return {
    documentId,
  };
};

interface CreateFeishuDocOptions {
  allowTenantFallback?: boolean;
}

export const createFeishuDoc = async (
  result: InterviewResult,
  candidateName: string,
  positionTitle: string,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string,
  options: CreateFeishuDocOptions = {}
): Promise<{ success: boolean; message: string; docUrl?: string }> => {
  const normalizedUserToken = userAccessToken?.trim();
  const canFallbackToTenantToken = Boolean(options.allowTenantFallback && appId && appSecret);
  let userPermissionError: FeishuApiError | null = null;

  try {
    if (normalizedUserToken) {
      try {
        const { documentId, permissionWarning } = await createFeishuDocWithToken(
          normalizedUserToken,
          result,
          candidateName,
          positionTitle,
          false
        );
        return {
          success: true,
          message: permissionWarning
            ? `已成功创建飞书文档，但自动设置“企业内获链可读”失败：${permissionWarning}`
            : '已成功创建飞书文档（当前登录用户可读）',
          docUrl: `https://feishu.cn/docx/${documentId}`,
        };
      } catch (error) {
        const tokenError = toFeishuApiError(error, '创建飞书文档失败');
        if (!isPermissionRelatedError(tokenError)) {
          throw tokenError;
        }
        if (!canFallbackToTenantToken) {
          throw createFeishuApiError(
            `${tokenError.message}。为保证“当前用户可读”，已禁用应用凭证回退。请退出并重新登录飞书，刷新用户授权范围后重试。`,
            tokenError.status,
            tokenError.code
          );
        }
        userPermissionError = tokenError;
      }
    }

    if (!normalizedUserToken && !canFallbackToTenantToken) {
      throw createFeishuApiError('缺少飞书访问凭证，请先登录飞书或配置 App ID / App Secret。');
    }

    const tenantToken = await getAccessToken(undefined, appId, appSecret);
    const { documentId, permissionWarning } = await createFeishuDocWithToken(
      tenantToken,
      result,
      candidateName,
      positionTitle,
      true
    );

    return {
      success: true,
      message: userPermissionError
        ? permissionWarning
          ? `用户 token 缺少导出权限，已自动回退到应用凭证完成导出，但自动设置“企业内获链可读”失败：${permissionWarning}`
          : '用户 token 缺少导出权限，已自动回退到应用凭证完成导出，并设置为企业内获链可读'
        : permissionWarning
          ? `已成功创建飞书文档，但自动设置“企业内获链可读”失败：${permissionWarning}`
          : '已成功创建飞书文档，并设置为企业内获链可读',
      docUrl: `https://feishu.cn/docx/${documentId}`,
    };
  } catch (error) {
    const finalError = toFeishuApiError(error, '创建飞书文档失败');
    const message = userPermissionError
      ? `用户 token 导出失败：${userPermissionError.message}；回退租户 token 失败：${finalError.message}`
      : finalError.message;
    console.error('Feishu doc creation error:', error);
    return {
      success: false,
      message,
    };
  }
};

export interface FeishuDocRawContent {
  documentId: string;
  title: string;
  content: string;
  transcriptDocumentId?: string;
  transcriptTitle?: string;
  transcriptContent?: string;
}

const parseFeishuError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    const code = data?.code;
    const msg = data?.msg || data?.error?.message || '未知飞书 API 错误';
    if (code) {
      return `${msg} (code: ${code})`;
    }
    return msg;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const fetchDocRawContentWithToken = async (
  docToken: string,
  accessToken: string
): Promise<{ content: string; title: string }> => {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const rawContentResponse = await fetch(`/api/feishu/docx/v1/documents/${docToken}/raw_content`, {
    method: 'GET',
    headers,
  });

  if (!rawContentResponse.ok) {
    throw new Error(await parseFeishuError(rawContentResponse));
  }

  const rawContentData = await rawContentResponse.json();
  if (rawContentData.code !== 0) {
    throw new Error(rawContentData.msg || '获取飞书文档内容失败');
  }

  const content = rawContentData.data?.content;
  if (typeof content !== 'string') {
    throw new Error('飞书文档内容为空或格式无效');
  }

  let title = docToken;
  const documentResponse = await fetch(`/api/feishu/docx/v1/documents/${docToken}`, {
    method: 'GET',
    headers,
  });
  if (documentResponse.ok) {
    const documentData = await documentResponse.json();
    const fetchedTitle = documentData.data?.document?.title;
    if (documentData.code === 0 && typeof fetchedTitle === 'string' && fetchedTitle.trim()) {
      title = fetchedTitle.trim();
    }
  }

  return { content, title };
};

const FEISHU_DOC_LINK_PATTERN = /https?:\/\/[^\s)\]]+\/(?:docx|wiki)\/[A-Za-z0-9]+[^\s)\]]*/gi;
const FEISHU_TRANSCRIPT_TITLE_PATTERN = /【面试】.+\d{4}年\d{1,2}月\d{1,2}日/;

const extractTranscriptLinkCandidates = (
  content: string,
  currentDocToken: string
): string[] => {
  const lines = content.split(/\r?\n/);
  const matches = new Set<string>();

  const collectLinks = (text: string) => {
    const urls = text.match(FEISHU_DOC_LINK_PATTERN) || [];
    urls.forEach((url) => {
      const token = extractFeishuDocTokenFromUrl(url);
      if (token && token !== currentDocToken) {
        matches.add(url);
      }
    });
  };

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();
    const looksLikeTranscriptSection =
      normalized.includes('文字记录') ||
      normalized.includes('transcript') ||
      normalized.includes('逐字稿') ||
      FEISHU_TRANSCRIPT_TITLE_PATTERN.test(line);

    if (!looksLikeTranscriptSection) {
      return;
    }

    for (let offset = 0; offset <= 6; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine) {
        break;
      }
      collectLinks(nextLine);
    }
  });

  return [...matches];
};

export const extractFeishuDocTokenFromUrl = (docUrl: string): string | null => {
  if (!docUrl) {
    return null;
  }

  const fromPath = (value: string): string | null => {
    const match = value.match(/\/(?:docx|wiki)\/([A-Za-z0-9]+)/i);
    return match?.[1] || null;
  };

  try {
    const parsed = new URL(docUrl.trim());
    const token = fromPath(parsed.pathname);
    if (token) {
      return token;
    }
  } catch {
    // Fall back to regex extraction from raw string when URL constructor fails.
  }

  return fromPath(docUrl.trim());
};

/**
 * Fetch Feishu doc raw content by doc/wiki link.
 * Wiki links are treated as doc tokens when possible.
 */
export const getFeishuDocRawContentFromLink = async (
  docUrl: string,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<FeishuDocRawContent> => {
  const docToken = extractFeishuDocTokenFromUrl(docUrl);
  if (!docToken) {
    throw new Error('飞书文档链接无效，应为 /docx/{token} 或 /wiki/{token}。');
  }

  const tokensToTry: string[] = [];
  if (userAccessToken?.trim()) {
    tokensToTry.push(userAccessToken.trim());
  }
  if (appId && appSecret) {
    const tenantToken = await getAccessToken(undefined, appId, appSecret);
    if (tenantToken && !tokensToTry.includes(tenantToken)) {
      tokensToTry.push(tenantToken);
    }
  }
  if (!tokensToTry.length) {
    throw new Error('缺少飞书 access token，请先登录飞书或配置应用凭证。');
  }

  const errors: string[] = [];
  for (const token of tokensToTry) {
    try {
      const doc = await fetchDocRawContentWithToken(docToken, token);
      const transcriptLinks = extractTranscriptLinkCandidates(doc.content, docToken);
      let transcriptContent: string | undefined;
      let transcriptTitle: string | undefined;
      let transcriptDocumentId: string | undefined;

      for (const transcriptLink of transcriptLinks) {
        const transcriptToken = extractFeishuDocTokenFromUrl(transcriptLink);
        if (!transcriptToken) {
          continue;
        }

        try {
          const transcriptDoc = await fetchDocRawContentWithToken(transcriptToken, token);
          transcriptContent = transcriptDoc.content;
          transcriptTitle = transcriptDoc.title;
          transcriptDocumentId = transcriptToken;
          break;
        } catch {
          // Ignore transcript fetch failure and fall back to summary doc content only.
        }
      }

      const combinedContent = transcriptContent
        ? `${doc.content}\n\n---\n【原始面试 Transcript：${transcriptTitle || transcriptDocumentId}】\n${transcriptContent}`
        : doc.content;

      return {
        documentId: docToken,
        title: doc.title,
        content: combinedContent,
        transcriptDocumentId,
        transcriptTitle,
        transcriptContent,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '未知错误');
    }
  }

  throw new Error(
    `读取飞书文档失败：${errors.join(' | ')}。` +
    '若你刚更新 OAuth 权限范围，请重新登录飞书以刷新用户令牌权限。'
  );
};

/**
 * Format interview result as Feishu Doc blocks
 */
const formatResultAsBlocks = (result: InterviewResult): object[] => {
  const blocks: object[] = [];

  // Interview info section
  blocks.push({
    block_type: 4, // heading2
    heading2: {
      elements: [{ text_run: { content: '面试信息' } }],
    },
  });

  blocks.push({
    block_type: 2, // text
    text: {
      elements: [{ text_run: { content: `面试官: ${result.interview_info.interviewer}` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `面试时间: ${result.interview_info.interview_time}` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `面试结果: ${result.interview_info.overall_result}` } }],
      style: {},
    },
  });

  // Evaluation dimensions section
  blocks.push({
    block_type: 4,
    heading2: {
      elements: [{ text_run: { content: '评估维度' } }],
    },
  });

  result.evaluation_dimensions.forEach((dim) => {
    blocks.push({
      block_type: 5, // heading3
      heading3: {
        elements: [{ text_run: { content: `${dim.dimension} (${dim.score}/5)` } }],
      },
    });

    blocks.push({
      block_type: 2,
      text: {
        elements: [{ text_run: { content: dim.assessment_points } }],
        style: {},
      },
    });
  });

  // Summary section
  blocks.push({
    block_type: 4,
    heading2: {
      elements: [{ text_run: { content: '综合评价' } }],
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `建议定级: ${result.summary.suggested_level}` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `综合评分: ${result.summary.comprehensive_score}/5` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `面试结论: ${result.summary.interview_conclusion}` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: `强烈推荐: ${result.summary.is_strongly_recommended ? '是' : '否'}` } }],
      style: {},
    },
  });

  blocks.push({
    block_type: 2,
    text: {
      elements: [{ text_run: { content: result.summary.overall_comment } }],
      style: {},
    },
  });

  // Additional info
  if (result.additional_info) {
    blocks.push({
      block_type: 4,
      heading2: {
        elements: [{ text_run: { content: '附加信息' } }],
      },
    });

    if (result.additional_info.strengths?.length) {
      blocks.push({
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `优势: ${result.additional_info.strengths.join(', ')}` } }],
          style: {},
        },
      });
    }

    if (result.additional_info.concerns?.length) {
      blocks.push({
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `担忧: ${result.additional_info.concerns.join(', ')}` } }],
          style: {},
        },
      });
    }

    if (result.additional_info.follow_up_questions?.length) {
      blocks.push({
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `后续跟进: ${result.additional_info.follow_up_questions.join(', ')}` } }],
          style: {},
        },
      });
    }
  }

  return blocks;
};

/**
 * Test Feishu API credentials by getting tenant access token
 */
export const testFeishuCredentials = async (
  appId: string,
  appSecret: string
): Promise<{ success: boolean; message: string }> => {
  if (!appId || !appSecret) {
    return { success: false, message: 'App ID 和 App Secret 不能为空' };
  }

  try {
    const response = await fetch('/api/feishu/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    });

    if (!response.ok) {
      return { success: false, message: `HTTP 错误：${response.status}` };
    }

    const data = await response.json();

    if (data.code !== 0) {
      return { success: false, message: data.msg || `错误码：${data.code}` };
    }

    if (data.tenant_access_token) {
      return { success: true, message: '飞书凭证验证成功' };
    }

    return { success: false, message: '未获取到 access token' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '连接失败',
    };
  }
};

export { extractLinksFromDescription };
