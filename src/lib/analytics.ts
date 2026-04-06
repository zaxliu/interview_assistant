import type { AIUsage } from '@/types';

const CLIENT_ID_KEY = 'interview-assistant-analytics-client-id';
const SESSION_ID_KEY = 'interview-assistant-analytics-session-id';
const APP_OPENED_KEY = 'interview-assistant-analytics-app-opened';
const BREADCRUMBS_KEY = 'interview-assistant-analytics-breadcrumbs';
const MAX_BREADCRUMBS = 20;
const MAX_TEXT_LENGTH = 500;

export type ErrorCategory = 'ai' | 'feishu' | 'wintalent' | 'pdf' | 'metrics' | 'ui' | 'network';

export interface ErrorBreadcrumb {
  at: string;
  eventName: string;
  feature?: string;
  page?: string;
  details?: Record<string, string | number | boolean>;
}

export interface ErrorRequestContext {
  endpoint?: string;
  method?: string;
  httpStatus?: number;
  provider?: string;
  model?: string;
  operation?: string;
}

export interface ErrorReproContext {
  route?: string;
  positionId?: string;
  candidateId?: string;
  candidateStatus?: string;
  hasFeishuAuth?: boolean;
  useAIParsing?: boolean;
  viewMode?: string;
  timeRange?: string;
  extra?: Record<string, string | number | boolean>;
}

export interface ErrorReportPayload {
  error: unknown;
  feature: string;
  errorCategory: ErrorCategory;
  eventName?: string;
  page?: string;
  durationMs?: number;
  model?: string;
  requestContext?: ErrorRequestContext;
  reproContext?: ErrorReproContext;
  inputSnapshot?: Record<string, unknown>;
  details?: Record<string, string | number | boolean>;
}

export interface AnalyticsEvent {
  eventName: string;
  eventType?: 'event' | 'error';
  page?: string;
  feature?: string;
  success?: boolean;
  durationMs?: number;
  model?: string;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  errorCode?: string;
  details?: Record<string, string | number | boolean>;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  errorStack?: string;
  requestContext?: Record<string, string | number | boolean>;
  reproContext?: Record<string, string | number | boolean>;
  inputSnapshot?: Record<string, string | number | boolean>;
  breadcrumbs?: ErrorBreadcrumb[];
  fingerprint?: string;
}

const safeStorageGet = (storage: Storage | undefined, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeStorageSet = (storage: Storage | undefined, key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage failures; analytics should not block product flows.
  }
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const getClientId = (): string => {
  const localStorageRef = typeof window !== 'undefined' ? window.localStorage : undefined;
  const existing = safeStorageGet(localStorageRef, CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }
  const clientId = generateId();
  safeStorageSet(localStorageRef, CLIENT_ID_KEY, clientId);
  return clientId;
};

const getSessionId = (): string => {
  const sessionStorageRef = typeof window !== 'undefined' ? window.sessionStorage : undefined;
  const existing = safeStorageGet(sessionStorageRef, SESSION_ID_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = generateId();
  safeStorageSet(sessionStorageRef, SESSION_ID_KEY, sessionId);
  return sessionId;
};

const getPage = (): string => {
  if (typeof window === 'undefined') {
    return '/';
  }
  return window.location.pathname;
};

const truncateText = (value: string, maxLength: number = MAX_TEXT_LENGTH): string => (
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
);

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('cookie') ||
    normalized.includes('authorization') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key')
  );
};

const sanitizeTextValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 1200) {
    return `[redacted long text length=${trimmed.length}]`;
  }
  return truncateText(trimmed);
};

const shouldPreserveFullInputSnapshotValue = (key: string | undefined, errorCategory: ErrorCategory | undefined): boolean => (
  errorCategory === 'wintalent' && key === 'wintalentLink'
);

const sanitizeUnknownValue = (
  value: unknown,
  key?: string,
  options?: { preserveFullValue?: boolean }
): string | number | boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  if (isSensitiveKey(key || '')) {
    return '[redacted]';
  }

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (options?.preserveFullValue) {
    return sanitizeTextValue(trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = truncateText(parsed.pathname, 120);
      return `${parsed.origin}${pathname}${parsed.search ? '?[redacted]' : ''}`;
    } catch {
      return truncateText(trimmed, 160);
    }
  }

  return sanitizeTextValue(trimmed);
};

const sanitizeRecord = (
  value: Record<string, unknown> | undefined,
  maxEntries: number = 20,
  options?: { errorCategory?: ErrorCategory }
): Record<string, string | number | boolean> | undefined => {
  if (!value) return undefined;

  const entries = Object.entries(value)
    .slice(0, maxEntries)
    .map(([key, entryValue]) => {
      const sanitized = sanitizeUnknownValue(entryValue, key, {
        preserveFullValue: shouldPreserveFullInputSnapshotValue(key, options?.errorCategory),
      });
      return sanitized === undefined ? null : [key, sanitized] as const;
    })
    .filter((entry): entry is readonly [string, string | number | boolean] => Boolean(entry));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const getStoredBreadcrumbs = (): ErrorBreadcrumb[] => {
  if (typeof window === 'undefined') return [];
  const raw = safeStorageGet(window.sessionStorage, BREADCRUMBS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ErrorBreadcrumb[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistBreadcrumbs = (breadcrumbs: ErrorBreadcrumb[]) => {
  if (typeof window === 'undefined') return;
  safeStorageSet(window.sessionStorage, BREADCRUMBS_KEY, JSON.stringify(breadcrumbs.slice(-MAX_BREADCRUMBS)));
};

const pushBreadcrumb = (event: AnalyticsEvent): ErrorBreadcrumb[] => {
  if (event.eventType === 'error') {
    return getStoredBreadcrumbs();
  }

  const breadcrumbs = [
    ...getStoredBreadcrumbs(),
    {
      at: new Date().toISOString(),
      eventName: event.eventName,
      feature: event.feature,
      page: event.page || getPage(),
      details: event.details,
    },
  ].slice(-MAX_BREADCRUMBS);

  persistBreadcrumbs(breadcrumbs);
  return breadcrumbs;
};

const serializeError = (error: unknown): { message: string; stack?: string; name?: string } => {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Unknown error',
      stack: error.stack ? truncateText(error.stack, 4000) : undefined,
      name: error.name,
    };
  }
  if (typeof error === 'string') {
    return { message: truncateText(error, 1000) };
  }
  try {
    return { message: truncateText(JSON.stringify(error), 1000) };
  } catch {
    return { message: 'Unknown error' };
  }
};

const normalizeFingerprintValue = (value: string): string =>
  value.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

const buildFingerprint = ({
  feature,
  errorCategory,
  message,
  requestContext,
}: {
  feature: string;
  errorCategory: ErrorCategory;
  message: string;
  requestContext?: ErrorRequestContext;
}) => {
  const parts = [
    errorCategory,
    feature,
    requestContext?.operation,
    requestContext?.endpoint,
    requestContext?.httpStatus ? String(requestContext.httpStatus) : '',
    normalizeFingerprintValue(message),
  ].filter(Boolean);
  return parts.join('|').slice(0, 300);
};

export const usageFromAIUsage = (usage: AIUsage | undefined) => {
  if (!usage) {
    return {};
  }
  return {
    inputTokens: usage.input,
    cachedTokens: usage.cached,
    outputTokens: usage.output,
  };
};

export const trackEvent = (event: AnalyticsEvent): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const breadcrumbs = pushBreadcrumb(event);
  const payload = {
    clientId: getClientId(),
    sessionId: getSessionId(),
    occurredAt: new Date().toISOString(),
    eventType: event.eventType || 'event',
    page: event.page || getPage(),
    feature: event.feature,
    success: event.success,
    durationMs: event.durationMs,
    model: event.model,
    inputTokens: event.inputTokens,
    cachedTokens: event.cachedTokens,
    outputTokens: event.outputTokens,
    errorCode: event.errorCode,
    details: event.details,
    errorCategory: event.errorCategory,
    errorMessage: event.errorMessage,
    errorStack: event.errorStack,
    requestContext: event.requestContext,
    reproContext: event.reproContext,
    inputSnapshot: event.inputSnapshot,
    breadcrumbs: event.breadcrumbs || breadcrumbs,
    fingerprint: event.fingerprint,
    eventName: event.eventName,
    appVersion: __APP_VERSION__,
    deploymentEnv: import.meta.env.MODE,
  };
  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/metrics/events', blob);
    return;
  }

  void fetch('/api/metrics/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore transport failures in the UI path.
  });
};

export const trackAppOpenedOnce = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const sessionStorageRef = window.sessionStorage;
  if (safeStorageGet(sessionStorageRef, APP_OPENED_KEY)) {
    return;
  }
  safeStorageSet(sessionStorageRef, APP_OPENED_KEY, 'true');
  trackEvent({
    eventName: 'app_opened',
    feature: 'lifecycle',
    success: true,
  });
};

export const reportError = ({
  error,
  feature,
  errorCategory,
  eventName,
  page,
  durationMs,
  model,
  requestContext,
  reproContext,
  inputSnapshot,
  details,
}: ErrorReportPayload): void => {
  const serialized = serializeError(error);
  const requestDetails = sanitizeRecord(requestContext as Record<string, unknown> | undefined, 12);
  const reproDetails = sanitizeRecord({
    ...reproContext,
    ...reproContext?.extra,
  } as Record<string, unknown> | undefined, 24);
  const sanitizedInputSnapshot = sanitizeRecord(inputSnapshot, 20, { errorCategory });
  const normalizedMessage = truncateText(serialized.message || 'Unknown error', 1000);

  trackEvent({
    eventName: eventName || `${feature}_failed`,
    eventType: 'error',
    feature,
    page,
    success: false,
    durationMs,
    model,
    errorCategory,
    errorCode: truncateText(normalizedMessage, 160),
    errorMessage: normalizedMessage,
    errorStack: serialized.stack,
    requestContext: requestDetails,
    reproContext: reproDetails,
    inputSnapshot: sanitizedInputSnapshot,
    details,
    fingerprint: buildFingerprint({
      feature,
      errorCategory,
      message: normalizedMessage,
      requestContext,
    }),
  });
};
