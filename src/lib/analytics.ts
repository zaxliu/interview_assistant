import type { AIUsage } from '@/types';

const CLIENT_ID_KEY = 'interview-assistant-analytics-client-id';
const SESSION_ID_KEY = 'interview-assistant-analytics-session-id';
const APP_OPENED_KEY = 'interview-assistant-analytics-app-opened';

export interface AnalyticsEvent {
  eventName: string;
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

  const payload = {
    clientId: getClientId(),
    sessionId: getSessionId(),
    occurredAt: new Date().toISOString(),
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
