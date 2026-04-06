import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const loadDotEnv = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
        return;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
};

await loadDotEnv(path.join(process.cwd(), '.env'));

const COOKIE_NAME = 'metrics_admin_session';
const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SCOPE = 'calendar:calendar:readonly docx:document:readonly docx:document';
const EVENTS_WITH_AI = new Set([
  'resume_import_succeeded',
  'question_generation_succeeded',
  'question_generation_failed',
  'summary_generation_succeeded',
  'summary_generation_failed',
]);
const FEEDBACK_EVENT_NAMES = new Set([
  'question_asked',
  'question_deleted',
  'question_edited',
  'summary_rewritten',
  'guidance_generated',
  'guidance_applied_to_question_generation',
  'guidance_applied_to_summary_generation',
]);
const FUNNEL_STEPS = [
  'app_opened',
  'feishu_login_succeeded',
  'calendar_sync_succeeded',
  'candidate_created',
  'resume_import_succeeded',
  'question_generation_succeeded',
  'summary_generation_succeeded',
  'feishu_export_succeeded',
];

const config = {
  host: process.env.METRICS_HOST || '127.0.0.1',
  port: Number(process.env.METRICS_PORT || 8788),
  storageFile: process.env.METRICS_STORAGE_FILE || path.join(process.cwd(), '.metrics', 'events.ndjson'),
  sessionSecret: process.env.METRICS_SESSION_SECRET || 'dev-metrics-session-secret',
  adminFeishuUserIds: new Set(
    String(process.env.METRICS_ADMIN_FEISHU_USER_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  ),
  feishuAppId: process.env.METRICS_FEISHU_APP_ID || process.env.VITE_FEISHU_APP_ID || '',
  feishuAppSecret: process.env.METRICS_FEISHU_APP_SECRET || process.env.VITE_FEISHU_APP_SECRET || '',
  appVersion: process.env.npm_package_version || '0.0.1',
};

const ensureStorageDir = async () => {
  await fs.mkdir(path.dirname(config.storageFile), { recursive: true });
};

const sha256 = (value) => createHmac('sha256', config.sessionSecret).update(value).digest('base64url');

const encodeBase64Url = (value) => Buffer.from(value, 'utf8').toString('base64url');
const decodeBase64Url = (value) => Buffer.from(value, 'base64url').toString('utf8');

const signPayload = (payload) => {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = sha256(encoded);
  return `${encoded}.${signature}`;
};

const verifySignedPayload = (value) => {
  const [encoded, providedSignature] = String(value || '').split('.');
  if (!encoded || !providedSignature) {
    return null;
  }

  const expectedSignature = sha256(encoded);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(encoded));
  } catch {
    return null;
  }
};

const parseCookies = (cookieHeader) => {
  return String(cookieHeader || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = value;
      return cookies;
    }, {});
};

const parseJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
};

const sendJson = (res, statusCode, payload, extraHeaders = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
};

const redirect = (res, location, headers = {}) => {
  res.writeHead(302, {
    Location: location,
    ...headers,
  });
  res.end();
};

const badRequest = (res, message) => sendJson(res, 400, { error: message });
const unauthorized = (res, message = 'Unauthorized') => sendJson(res, 401, { error: message });
const forbidden = (res, message = 'Forbidden') => sendJson(res, 403, { error: message });
const notFound = (res) => sendJson(res, 404, { error: 'Not Found' });

const parseHeaderUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const getOrigin = (req) => {
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : null;
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host']
    : null;

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const originUrl = parseHeaderUrl(req.headers.origin);
  if (originUrl) {
    return originUrl.origin;
  }

  const refererUrl = parseHeaderUrl(req.headers.referer);
  if (refererUrl) {
    return refererUrl.origin;
  }

  const host = forwardedHost || req.headers.host;
  if (!host) {
    return `http://${config.host}:${config.port}`;
  }
  return `${forwardedProto || 'http'}://${host}`;
};

const normalizeReturnTo = (value) => {
  if (!value || typeof value !== 'string') {
    return '/usage-admin';
  }
  if (!value.startsWith('/')) {
    return '/usage-admin';
  }
  if (value.startsWith('//')) {
    return '/usage-admin';
  }
  return value;
};

const normalizeAbsoluteOrigin = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

const buildState = (returnTo, origin) => signPayload({
  returnTo: normalizeReturnTo(returnTo),
  origin: normalizeAbsoluteOrigin(origin),
  exp: Date.now() + STATE_TTL_MS,
});

const getSessionUser = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawCookie = cookies[COOKIE_NAME];
  const payload = verifySignedPayload(rawCookie);
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    return null;
  }
  return payload.user && typeof payload.user === 'object' ? payload.user : null;
};

const buildSessionCookie = (user) => {
  const value = signPayload({
    user,
    exp: Date.now() + SESSION_TTL_MS,
  });
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
};

const clearSessionCookie = () =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

const fetchFeishuJson = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.msg || `Feishu request failed: ${response.status}`);
  }

  if (payload?.code !== 0) {
    throw new Error(payload?.msg || 'Feishu request failed');
  }

  return payload;
};

const exchangeCodeForToken = async (code, redirectUri) => {
  const payload = await fetchFeishuJson('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.feishuAppId,
      client_secret: config.feishuAppSecret,
      redirect_uri: redirectUri,
    }),
  });
  return payload.access_token;
};

const fetchFeishuUserInfo = async (accessToken) => {
  const payload = await fetchFeishuJson('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const user = payload.data || {};
  return {
    id: user.user_id || user.open_id || '',
    name: user.name || '未知管理员',
    avatarUrl: user.avatar_url || user.avatar_thumb || '',
  };
};

const clampString = (value, maxLength = 256) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const clampNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const sanitizeDetails = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .slice(0, 20)
    .map(([key, detailValue]) => {
      if (typeof detailValue === 'string') {
        return [key, detailValue.slice(0, 200)];
      }
      if (typeof detailValue === 'number' && Number.isFinite(detailValue)) {
        return [key, detailValue];
      }
      if (typeof detailValue === 'boolean') {
        return [key, detailValue];
      }
      return null;
    })
    .filter(Boolean);

  return entries.length ? Object.fromEntries(entries) : undefined;
};

const sanitizeBreadcrumbs = (value) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const breadcrumbs = value
    .slice(-20)
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      return {
        at: clampString(item.at, 40),
        eventName: clampString(item.eventName, 80),
        feature: clampString(item.feature, 80),
        page: clampString(item.page, 160),
        details: sanitizeDetails(item.details),
      };
    })
    .filter((item) => item && item.at && item.eventName);

  return breadcrumbs.length ? breadcrumbs : undefined;
};

const sanitizeEvent = (rawEvent, req) => {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    return null;
  }

  const now = new Date().toISOString();
  const occurredAtRaw = rawEvent.occurredAt;
  const occurredAt = typeof occurredAtRaw === 'string' && !Number.isNaN(Date.parse(occurredAtRaw))
    ? new Date(occurredAtRaw).toISOString()
    : now;
  const success = typeof rawEvent.success === 'boolean' ? rawEvent.success : undefined;
  const eventType = rawEvent.eventType === 'error' ? 'error' : 'event';

  return {
    id: randomUUID(),
    eventName: clampString(rawEvent.eventName, 80),
    eventType,
    clientId: clampString(rawEvent.clientId, 100),
    sessionId: clampString(rawEvent.sessionId, 100),
    occurredAt,
    receivedAt: now,
    page: clampString(rawEvent.page, 160),
    feature: clampString(rawEvent.feature, 80),
    success,
    durationMs: clampNumber(rawEvent.durationMs),
    model: clampString(rawEvent.model, 80),
    inputTokens: clampNumber(rawEvent.inputTokens),
    cachedTokens: clampNumber(rawEvent.cachedTokens),
    outputTokens: clampNumber(rawEvent.outputTokens),
    errorCode: clampString(rawEvent.errorCode, 120),
    errorCategory: clampString(rawEvent.errorCategory, 40),
    errorMessage: clampString(rawEvent.errorMessage, 1000),
    errorStack: clampString(rawEvent.errorStack, 4000),
    fingerprint: clampString(rawEvent.fingerprint, 300),
    appVersion: clampString(rawEvent.appVersion, 40) || config.appVersion,
    deploymentEnv: clampString(rawEvent.deploymentEnv, 40),
    details: sanitizeDetails(rawEvent.details),
    requestContext: sanitizeDetails(rawEvent.requestContext),
    reproContext: sanitizeDetails(rawEvent.reproContext),
    inputSnapshot: sanitizeDetails(rawEvent.inputSnapshot),
    breadcrumbs: sanitizeBreadcrumbs(rawEvent.breadcrumbs),
    userAgent: clampString(req.headers['user-agent'], 300),
  };
};

const appendEvents = async (events) => {
  if (!events.length) {
    return;
  }
  await ensureStorageDir();
  const payload = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  await fs.appendFile(config.storageFile, payload, 'utf8');
};

const loadEvents = async () => {
  try {
    const content = await fs.readFile(config.storageFile, 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const parseDateParam = (value, fallbackDate) => {
  if (!value || typeof value !== 'string') {
    return fallbackDate;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackDate : parsed;
};

const filterEventsByRange = (events, searchParams) => {
  const now = new Date();
  const from = parseDateParam(searchParams.get('from'), new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)));
  const to = parseDateParam(searchParams.get('to'), now);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    events: events.filter((event) => {
      const timestamp = Date.parse(event.occurredAt || event.receivedAt || '');
      return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp <= toMs;
    }),
  };
};

const summarizeOverview = (events) => {
  const uniqueClients = new Set(events.map((event) => event.clientId).filter(Boolean));
  const totalAiCalls = events.filter((event) => EVENTS_WITH_AI.has(event.eventName)).length;
  const totalFailures = events.filter((event) => event.success === false).length;
  const totalSuccesses = events.filter((event) => event.success === true).length;
  const totalTokens = events.reduce((accumulator, event) => ({
    input: accumulator.input + (event.inputTokens || 0),
    cached: accumulator.cached + (event.cachedTokens || 0),
    output: accumulator.output + (event.outputTokens || 0),
  }), { input: 0, cached: 0, output: 0 });

  return {
    uniqueVisitors: uniqueClients.size,
    totalEvents: events.length,
    totalAiCalls,
    totalFailures,
    totalSuccesses,
    failureRate: events.length ? Number((totalFailures / events.length).toFixed(4)) : 0,
    tokens: totalTokens,
  };
};

const summarizeFunnel = (events) => {
  return FUNNEL_STEPS.map((step) => {
    const uniqueClients = new Set(
      events
        .filter((event) => event.eventName === step && event.clientId)
        .map((event) => event.clientId)
    );
    return {
      eventName: step,
      uniqueClients: uniqueClients.size,
    };
  });
};

const summarizeAi = (events) => {
  const aiEvents = events.filter((event) => event.model || EVENTS_WITH_AI.has(event.eventName));
  const byModel = new Map();

  aiEvents.forEach((event) => {
    const key = event.model || 'unknown';
    const current = byModel.get(key) || {
      model: key,
      calls: 0,
      failures: 0,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      totalDurationMs: 0,
      timedCalls: 0,
    };
    current.calls += 1;
    current.failures += event.success === false ? 1 : 0;
    current.inputTokens += event.inputTokens || 0;
    current.cachedTokens += event.cachedTokens || 0;
    current.outputTokens += event.outputTokens || 0;
    if (typeof event.durationMs === 'number') {
      current.totalDurationMs += event.durationMs;
      current.timedCalls += 1;
    }
    byModel.set(key, current);
  });

  return {
    totals: aiEvents.reduce((accumulator, event) => ({
      calls: accumulator.calls + 1,
      failures: accumulator.failures + (event.success === false ? 1 : 0),
      inputTokens: accumulator.inputTokens + (event.inputTokens || 0),
      cachedTokens: accumulator.cachedTokens + (event.cachedTokens || 0),
      outputTokens: accumulator.outputTokens + (event.outputTokens || 0),
    }), { calls: 0, failures: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 }),
    byModel: Array.from(byModel.values())
      .map((item) => ({
        ...item,
        avgDurationMs: item.timedCalls ? Math.round(item.totalDurationMs / item.timedCalls) : null,
      }))
      .sort((left, right) => right.calls - left.calls),
  };
};

const getAiFailureEvents = (events) =>
  events.filter((event) => (event.model || EVENTS_WITH_AI.has(event.eventName)) && event.success === false);

const buildBucketKey = (isoString, interval) => {
  const date = new Date(isoString);
  if (interval === 'hour') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:00`;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const summarizeTimeseries = (events, interval) => {
  const buckets = new Map();
  events.forEach((event) => {
    const key = buildBucketKey(event.occurredAt || event.receivedAt, interval);
    const current = buckets.get(key) || {
      bucket: key,
      totalEvents: 0,
      totalFailures: 0,
      totalAiCalls: 0,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
    };
    current.totalEvents += 1;
    current.totalFailures += event.success === false ? 1 : 0;
    current.totalAiCalls += event.model || EVENTS_WITH_AI.has(event.eventName) ? 1 : 0;
    current.inputTokens += event.inputTokens || 0;
    current.cachedTokens += event.cachedTokens || 0;
    current.outputTokens += event.outputTokens || 0;
    buckets.set(key, current);
  });

  return Array.from(buckets.values()).sort((left, right) => left.bucket.localeCompare(right.bucket));
};

const summarizeTimeseriesByFeature = (events, interval) => {
  // bucket -> feature -> count
  const buckets = new Map();
  events.forEach((event) => {
    const key = buildBucketKey(event.occurredAt || event.receivedAt, interval);
    const feature = event.feature || 'unknown';
    if (!buckets.has(key)) {
      buckets.set(key, new Map());
    }
    const featureMap = buckets.get(key);
    featureMap.set(feature, (featureMap.get(feature) || 0) + 1);
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, featureMap]) => ({
      bucket,
      byFeature: Array.from(featureMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([feature, count]) => ({ feature, count })),
    }));
};

const summarizeFeedback = (events) => {
  const feedbackEvents = events.filter((event) => FEEDBACK_EVENT_NAMES.has(event.eventName));
  const byPosition = new Map();
  let questionAsked = 0;
  let questionEdited = 0;
  let questionDeleted = 0;
  let summaryRewritten = 0;
  let guidanceGenerated = 0;
  let guidanceAppliedQuestion = 0;
  let guidanceAppliedSummary = 0;

  feedbackEvents.forEach((event) => {
    const positionId = typeof event.details?.positionId === 'string' ? event.details.positionId : 'unknown';
    const current = byPosition.get(positionId) || {
      positionId,
      questionAsked: 0,
      questionEdited: 0,
      questionDeleted: 0,
      summaryRewritten: 0,
      guidanceGenerated: 0,
      guidanceAppliedQuestion: 0,
      guidanceAppliedSummary: 0,
    };

    switch (event.eventName) {
      case 'question_asked':
        questionAsked += 1;
        current.questionAsked += 1;
        break;
      case 'question_edited':
        questionEdited += 1;
        current.questionEdited += 1;
        break;
      case 'question_deleted':
        questionDeleted += 1;
        current.questionDeleted += 1;
        break;
      case 'summary_rewritten':
        summaryRewritten += 1;
        current.summaryRewritten += 1;
        break;
      case 'guidance_generated':
        guidanceGenerated += 1;
        current.guidanceGenerated += 1;
        break;
      case 'guidance_applied_to_question_generation':
        guidanceAppliedQuestion += 1;
        current.guidanceAppliedQuestion += 1;
        break;
      case 'guidance_applied_to_summary_generation':
        guidanceAppliedSummary += 1;
        current.guidanceAppliedSummary += 1;
        break;
      default:
        break;
    }
    byPosition.set(positionId, current);
  });

  // Count total generation requests as the denominator for guidance hit rate
  const questionGenSucceeded = events.filter((e) => e.eventName === 'question_generation_succeeded').length;
  const summaryGenSucceeded = events.filter((e) => e.eventName === 'summary_generation_succeeded').length;
  const totalGenerationRequests = questionGenSucceeded + summaryGenSucceeded;

  const questionBase = questionAsked + questionDeleted;
  const questionAdoptionRate = questionBase ? Number((questionAsked / questionBase).toFixed(4)) : 0;
  const questionRewriteRate = questionAsked ? Number((questionEdited / questionAsked).toFixed(4)) : 0;
  const guidanceApplyBase = guidanceAppliedQuestion + guidanceAppliedSummary;
  const guidanceHitRate = totalGenerationRequests
    ? Number((guidanceApplyBase / totalGenerationRequests).toFixed(4))
    : 0;

  const byPositionRows = Array.from(byPosition.values())
    .map((row) => {
      const rowQuestionBase = row.questionAsked + row.questionDeleted;
      return {
        ...row,
        questionAdoptionRate: rowQuestionBase ? Number((row.questionAsked / rowQuestionBase).toFixed(4)) : 0,
        questionRewriteRate: row.questionAsked ? Number((row.questionEdited / row.questionAsked).toFixed(4)) : 0,
      };
    })
    .sort((a, b) => (b.questionAsked + b.summaryRewritten) - (a.questionAsked + a.summaryRewritten));

  return {
    totals: {
      events: feedbackEvents.length,
      questionAsked,
      questionEdited,
      questionDeleted,
      summaryRewritten,
      guidanceGenerated,
      guidanceAppliedQuestion,
      guidanceAppliedSummary,
      questionAdoptionRate,
      questionRewriteRate,
      guidanceHitRate,
    },
    byPosition: byPositionRows,
  };
};

const getErrorEvents = (events) =>
  events.filter((event) => event.eventType === 'error' || event.success === false);

const filterErrorEvents = (events, searchParams) => {
  const feature = clampString(searchParams.get('feature'), 80);
  const errorCategory = clampString(searchParams.get('errorCategory'), 40);
  const fingerprint = clampString(searchParams.get('fingerprint'), 300);

  return getErrorEvents(events).filter((event) => {
    if (feature && event.feature !== feature) return false;
    if (errorCategory && event.errorCategory !== errorCategory) return false;
    if (fingerprint && event.fingerprint !== fingerprint) return false;
    return true;
  });
};

const filterAiFailureEvents = (events, searchParams) => {
  const feature = clampString(searchParams.get('feature'), 80);
  const errorCategory = clampString(searchParams.get('errorCategory'), 40);
  const fingerprint = clampString(searchParams.get('fingerprint'), 300);

  return getAiFailureEvents(events).filter((event) => {
    if (feature && event.feature !== feature) return false;
    if (errorCategory && event.errorCategory !== errorCategory) return false;
    if (fingerprint && event.fingerprint !== fingerprint) return false;
    return true;
  });
};

const summarizeErrors = (events) => {
  const groups = new Map();

  events.forEach((event) => {
    const groupKey = event.fingerprint || `${event.feature || 'unknown'}|${event.errorCode || event.eventName || event.id}`;
    const current = groups.get(groupKey) || {
      fingerprint: groupKey,
      latestEventId: event.id,
      latestOccurredAt: event.occurredAt || event.receivedAt,
      firstOccurredAt: event.occurredAt || event.receivedAt,
      count: 0,
      uniqueClients: new Set(),
      feature: event.feature,
      errorCategory: event.errorCategory,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      latestPage: event.page,
      latestModel: event.model,
      latestAppVersion: event.appVersion,
    };

    current.count += 1;
    if (event.clientId) {
      current.uniqueClients.add(event.clientId);
    }

    const currentTime = Date.parse(event.occurredAt || event.receivedAt || '');
    const latestTime = Date.parse(current.latestOccurredAt || '');
    const firstTime = Date.parse(current.firstOccurredAt || '');
    if (Number.isFinite(currentTime) && (!Number.isFinite(latestTime) || currentTime > latestTime)) {
      current.latestEventId = event.id;
      current.latestOccurredAt = event.occurredAt || event.receivedAt;
      current.latestPage = event.page;
      current.latestModel = event.model;
      current.latestAppVersion = event.appVersion;
      current.errorCode = event.errorCode || current.errorCode;
      current.errorMessage = event.errorMessage || current.errorMessage;
      current.feature = event.feature || current.feature;
      current.errorCategory = event.errorCategory || current.errorCategory;
    }
    if (Number.isFinite(currentTime) && (!Number.isFinite(firstTime) || currentTime < firstTime)) {
      current.firstOccurredAt = event.occurredAt || event.receivedAt;
    }

    groups.set(groupKey, current);
  });

  return Array.from(groups.values())
    .map((group) => ({
      fingerprint: group.fingerprint,
      latestEventId: group.latestEventId,
      latestOccurredAt: group.latestOccurredAt,
      firstOccurredAt: group.firstOccurredAt,
      count: group.count,
      uniqueClients: group.uniqueClients.size,
      feature: group.feature,
      errorCategory: group.errorCategory,
      errorCode: group.errorCode,
      errorMessage: group.errorMessage,
      latestPage: group.latestPage,
      latestModel: group.latestModel,
      latestAppVersion: group.latestAppVersion,
    }))
    .sort((left, right) => right.latestOccurredAt.localeCompare(left.latestOccurredAt));
};

const getErrorDetail = (events, id) => {
  const target = getErrorEvents(events).find((event) => event.id === id);
  if (!target) {
    return null;
  }

  const related = getErrorEvents(events)
    .filter((event) => event.id !== id && event.fingerprint && event.fingerprint === target.fingerprint)
    .sort((left, right) => (right.occurredAt || right.receivedAt).localeCompare(left.occurredAt || left.receivedAt))
    .slice(0, 10);

  return {
    error: target,
    related,
  };
};

const requireAdmin = (req, res) => {
  const user = getSessionUser(req);
  if (!user || !user.id) {
    unauthorized(res);
    return null;
  }
  if (!config.adminFeishuUserIds.has(user.id)) {
    forbidden(res);
    return null;
  }
  return user;
};

const server = createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      notFound(res);
      return;
    }

    const requestUrl = new URL(req.url, getOrigin(req));

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/auth/login') {
      if (!config.feishuAppId || !config.feishuAppSecret) {
        sendJson(res, 500, { error: 'Metrics admin Feishu credentials are not configured.' });
        return;
      }

      const returnTo = normalizeReturnTo(requestUrl.searchParams.get('return_to'));
      const origin = normalizeAbsoluteOrigin(requestUrl.searchParams.get('origin')) || getOrigin(req);
      const redirectUri = `${origin}/api/metrics/auth/callback`;
      const params = new URLSearchParams({
        app_id: config.feishuAppId,
        redirect_uri: redirectUri,
        scope: DEFAULT_SCOPE,
        state: buildState(returnTo, origin),
      });
      redirect(res, `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`);
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/auth/callback') {
      const code = requestUrl.searchParams.get('code');
      const state = verifySignedPayload(requestUrl.searchParams.get('state'));
      if (!code || !state || typeof state.exp !== 'number' || state.exp < Date.now()) {
        redirect(res, '/usage-admin?adminAuth=failed');
        return;
      }

      const callbackOrigin = normalizeAbsoluteOrigin(state.origin) || getOrigin(req);
      const redirectUri = `${callbackOrigin}/api/metrics/auth/callback`;

      try {
        const accessToken = await exchangeCodeForToken(code, redirectUri);
        const user = await fetchFeishuUserInfo(accessToken);
        const returnTo = normalizeReturnTo(state.returnTo);

        if (!user.id || !config.adminFeishuUserIds.has(user.id)) {
          redirect(res, `${returnTo}${returnTo.includes('?') ? '&' : '?'}adminAuth=forbidden`, {
            'Set-Cookie': clearSessionCookie(),
          });
          return;
        }

        redirect(res, returnTo, {
          'Set-Cookie': buildSessionCookie(user),
        });
      } catch (error) {
        console.error('[metrics] OAuth callback failed:', error);
        redirect(res, '/usage-admin?adminAuth=failed');
      }
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/metrics/auth/logout') {
      sendJson(res, 200, { success: true }, {
        'Set-Cookie': clearSessionCookie(),
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/admin/me') {
      const user = getSessionUser(req);
      if (!user || !user.id) {
        unauthorized(res);
        return;
      }
      if (!config.adminFeishuUserIds.has(user.id)) {
        forbidden(res);
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        user,
      });
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/metrics/events') {
      const body = await parseJsonBody(req);
      const rawEvents = Array.isArray(body?.events) ? body.events : body ? [body] : [];
      const events = rawEvents
        .map((item) => sanitizeEvent(item, req))
        .filter((item) => item && item.eventName && item.clientId && item.sessionId);

      if (!events.length) {
        badRequest(res, 'No valid events received.');
        return;
      }

      await appendEvents(events);
      sendJson(res, 202, { accepted: events.length });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/metrics/dashboard/')) {
      const user = requireAdmin(req, res);
      if (!user) {
        return;
      }

      const events = await loadEvents();
      const range = filterEventsByRange(events, requestUrl.searchParams);

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/overview') {
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          overview: summarizeOverview(range.events),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/funnel') {
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          funnel: summarizeFunnel(range.events),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/ai') {
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          ai: summarizeAi(range.events),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/timeseries') {
        const interval = requestUrl.searchParams.get('interval') === 'hour' ? 'hour' : 'day';
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          interval,
          timeseries: summarizeTimeseries(range.events, interval),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/timeseries-by-feature') {
        const interval = requestUrl.searchParams.get('interval') === 'hour' ? 'hour' : 'day';
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          interval,
          timeseries: summarizeTimeseriesByFeature(range.events, interval),
        });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/dashboard/feedback') {
        sendJson(res, 200, {
          range: { from: range.from, to: range.to },
          feedback: summarizeFeedback(range.events),
        });
        return;
      }
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/errors') {
      const user = requireAdmin(req, res);
      if (!user) {
        return;
      }

      const events = await loadEvents();
      const range = filterEventsByRange(events, requestUrl.searchParams);
      const errorEvents = filterErrorEvents(range.events, requestUrl.searchParams);
      sendJson(res, 200, {
        range: { from: range.from, to: range.to },
        errors: summarizeErrors(errorEvents),
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/metrics/errors/ai-failures') {
      const user = requireAdmin(req, res);
      if (!user) {
        return;
      }

      const events = await loadEvents();
      const range = filterEventsByRange(events, requestUrl.searchParams);
      const aiFailures = filterAiFailureEvents(range.events, requestUrl.searchParams)
        .sort((left, right) => (right.occurredAt || right.receivedAt).localeCompare(left.occurredAt || left.receivedAt));
      sendJson(res, 200, {
        range: { from: range.from, to: range.to },
        events: aiFailures,
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/metrics/errors/')) {
      const user = requireAdmin(req, res);
      if (!user) {
        return;
      }

      const id = decodeURIComponent(requestUrl.pathname.slice('/api/metrics/errors/'.length));
      if (!id) {
        notFound(res);
        return;
      }

      const events = await loadEvents();
      const detail = getErrorDetail(events, id);
      if (!detail) {
        notFound(res);
        return;
      }

      sendJson(res, 200, detail);
      return;
    }

    notFound(res);
  } catch (error) {
    console.error('[metrics] request failed:', error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[metrics] listening on http://${config.host}:${config.port}`);
  console.log(`[metrics] storage file: ${config.storageFile}`);
  console.log('[metrics] endpoints:');
  console.log('  GET  /api/metrics/healthz');
  console.log('  POST /api/metrics/events');
  console.log('  GET  /api/metrics/auth/login');
  console.log('  GET  /api/metrics/auth/callback');
  console.log('  POST /api/metrics/auth/logout');
  console.log('  GET  /api/metrics/admin/me');
  console.log('  GET  /api/metrics/dashboard/overview');
  console.log('  GET  /api/metrics/dashboard/funnel');
  console.log('  GET  /api/metrics/dashboard/ai');
  console.log('  GET  /api/metrics/dashboard/timeseries');
  console.log('  GET  /api/metrics/dashboard/timeseries-by-feature');
  console.log('  GET  /api/metrics/dashboard/feedback');
  console.log('  GET  /api/metrics/errors');
  console.log('  GET  /api/metrics/errors/:id');
});
