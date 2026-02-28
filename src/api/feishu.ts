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
 * Generate OAuth authorization URL with calendar scope
 */
export const getOAuthAuthorizationUrl = (
  appId: string,
  redirectUri: string,
  state?: string
): string => {
  // Request calendar readonly permission
  const scope = 'calendar:calendar:readonly';

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
    throw new Error(`Failed to exchange code for token: ${response.status}`);
  }

  const data = await response.json();
  console.log('Token exchange response:', data);

  if (data.code !== 0) {
    const errorMsg = data.msg || 'Failed to get access token';
    console.error('Feishu API error:', data.code, errorMsg);
    throw new Error(`${errorMsg} (code: ${data.code})`);
  }

  // Response structure: { code: 0, access_token: '...', refresh_token: '...', ... }
  if (!data.access_token) {
    console.error('No access_token in response:', data);
    throw new Error('No access token in response');
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
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(data.msg || 'Failed to refresh access token');
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
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  const data = await response.json();
  console.log('User info response:', data);

  if (data.code !== 0) {
    throw new Error(data.msg || 'Failed to get user info');
  }

  // Response structure: { code: 0, data: { user_id, name, avatar_url, ... } }
  const userData = data.data;
  return {
    id: userData.user_id || userData.open_id || '',
    name: userData.name || 'Unknown User',
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
    throw new Error('Either user_access_token or app_id + app_secret must be provided');
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
        throw new Error('CORS error: Feishu API blocked by browser. Please check proxy configuration.');
      }
      const errorText = await response.text();
      console.error('Token API error response:', errorText);
      throw new Error(`Failed to get Feishu access token: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(data.msg || 'Failed to get Feishu access token');
    }

    cachedToken = {
      accessToken: data.tenant_access_token,
      expireTime: Date.now() + (data.expire - 300) * 1000, // 5 minutes buffer
    };

    return cachedToken.accessToken;
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error: Cannot reach Feishu API. Please check your network connection.');
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
    throw new Error('Failed to get calendar list');
  }

  const calendarsData = await calendarsResponse.json();
  if (calendarsData.code !== 0) {
    throw new Error(calendarsData.msg || 'Failed to get calendar list');
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
export const syncInterviewsFromCalendar = async (
  days: number = 30,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<{
  events: CalendarEvent[];
  positions: Map<string, { title: string; team: string }>;
}> => {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

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
export const createFeishuDoc = async (
  result: InterviewResult,
  candidateName: string,
  positionTitle: string,
  userAccessToken?: string,
  appId?: string,
  appSecret?: string
): Promise<{ success: boolean; message: string; docUrl?: string }> => {
  try {
    const accessToken = await getAccessToken(userAccessToken, appId, appSecret);

    // Create document
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

    if (!createResponse.ok) {
      throw new Error('Failed to create Feishu document');
    }

    const createData = await createResponse.json();

    if (createData.code !== 0) {
      throw new Error(createData.msg || 'Failed to create Feishu document');
    }

    const documentId = createData.data?.document?.document_id;

    // Add content blocks
    const blocks = formatResultAsBlocks(result);

    await fetch(`/api/feishu/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_create`, {
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

    return {
      success: true,
      message: 'Successfully created Feishu document',
      docUrl: `https://feishu.cn/docx/${documentId}`,
    };
  } catch (error) {
    console.error('Feishu doc creation error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create Feishu document',
    };
  }
};

/**
 * Format interview result as Feishu Doc blocks
 */
const formatResultAsBlocks = (result: InterviewResult): object[] => {
  const blocks: object[] = [];

  // Interview info section
  blocks.push({
    block_type: 3, // heading2
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
    block_type: 3,
    heading2: {
      elements: [{ text_run: { content: '评估维度' } }],
    },
  });

  result.evaluation_dimensions.forEach((dim) => {
    blocks.push({
      block_type: 3,
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
    block_type: 3,
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
      block_type: 3,
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

export { extractLinksFromDescription };
