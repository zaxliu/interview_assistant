export interface MetricsAdminUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface MetricsErrorBreadcrumb {
  at: string;
  eventName: string;
  feature?: string;
  page?: string;
  details?: Record<string, string | number | boolean>;
}

export interface MetricsErrorEvent {
  id: string;
  eventName: string;
  occurredAt: string;
  receivedAt: string;
  page?: string;
  feature?: string;
  model?: string;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  errorStack?: string;
  fingerprint?: string;
  appVersion?: string;
  deploymentEnv?: string;
  requestContext?: Record<string, string | number | boolean>;
  reproContext?: Record<string, string | number | boolean>;
  inputSnapshot?: Record<string, string | number | boolean>;
  details?: Record<string, string | number | boolean>;
  breadcrumbs?: MetricsErrorBreadcrumb[];
  clientId?: string;
  sessionId?: string;
}

export interface MetricsErrorSummary {
  fingerprint: string;
  latestEventId: string;
  latestOccurredAt: string;
  firstOccurredAt: string;
  count: number;
  uniqueClients: number;
  feature?: string;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  latestPage?: string;
  latestModel?: string;
  latestAppVersion?: string;
}

export interface MetricsOverview {
  uniqueVisitors: number;
  totalEvents: number;
  totalAiCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  failureRate: number;
  tokens: {
    input: number;
    cached: number;
    output: number;
  };
}

export interface MetricsFunnelStep {
  eventName: string;
  uniqueClients: number;
}

export interface MetricsAiModelSummary {
  model: string;
  calls: number;
  failures: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  avgDurationMs: number | null;
}

export interface MetricsTimeseriesPoint {
  bucket: string;
  totalEvents: number;
  totalFailures: number;
  totalAiCalls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface MetricsEventByFeature {
  feature: string;
  totalEvents: number;
  totalSuccesses: number;
  totalFailures: number;
}

export interface MetricsFeedbackByPosition {
  positionId: string;
  questionAsked: number;
  questionEdited: number;
  questionDeleted: number;
  summaryRewritten: number;
  guidanceGenerated: number;
  guidanceAppliedQuestion: number;
  guidanceAppliedSummary: number;
  questionAdoptionRate: number;
  questionRewriteRate: number;
}

export interface MetricsFeedbackSummary {
  totals: {
    events: number;
    questionAsked: number;
    questionEdited: number;
    questionDeleted: number;
    summaryRewritten: number;
    guidanceGenerated: number;
    guidanceAppliedQuestion: number;
    guidanceAppliedSummary: number;
    questionAdoptionRate: number;
    questionRewriteRate: number;
    guidanceHitRate: number;
  };
  byPosition: MetricsFeedbackByPosition[];
}

interface RangeResponse {
  range: {
    from: string;
    to: string;
  };
}

const withRange = (path: string, from: string, to: string, interval?: 'day' | 'hour') => {
  const params = new URLSearchParams({
    from,
    to,
  });
  if (interval) {
    params.set('interval', interval);
  }
  return `${path}?${params.toString()}`;
};

const fetchJson = async <T>(input: RequestInfo): Promise<T> => {
  const response = await fetch(input, {
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error || response.statusText);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
};

export const getMetricsAdminMe = () =>
  fetchJson<{ authenticated: true; user: MetricsAdminUser }>('/api/metrics/admin/me');

export const loginToUsageAdmin = (returnTo: string = '/usage-admin') => {
  const params = new URLSearchParams({
    return_to: returnTo,
    origin: window.location.origin,
  });
  window.location.assign(`/api/metrics/auth/login?${params.toString()}`);
};

export const logoutUsageAdmin = async () => {
  await fetch('/api/metrics/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
};

export const getMetricsOverview = (from: string, to: string) =>
  fetchJson<RangeResponse & { overview: MetricsOverview }>(withRange('/api/metrics/dashboard/overview', from, to));

export const getMetricsFunnel = (from: string, to: string) =>
  fetchJson<RangeResponse & { funnel: MetricsFunnelStep[] }>(withRange('/api/metrics/dashboard/funnel', from, to));

export const getMetricsAi = (from: string, to: string) =>
  fetchJson<RangeResponse & {
    ai: {
      totals: {
        calls: number;
        failures: number;
        inputTokens: number;
        cachedTokens: number;
        outputTokens: number;
      };
      byModel: MetricsAiModelSummary[];
    };
  }>(withRange('/api/metrics/dashboard/ai', from, to));

export const getMetricsTimeseries = (from: string, to: string, interval: 'day' | 'hour' = 'day') =>
  fetchJson<RangeResponse & {
    interval: 'day' | 'hour';
    timeseries: MetricsTimeseriesPoint[];
  }>(withRange('/api/metrics/dashboard/timeseries', from, to, interval));

export const getMetricsFeedback = (from: string, to: string) =>
  fetchJson<RangeResponse & { feedback: MetricsFeedbackSummary }>(withRange('/api/metrics/dashboard/feedback', from, to));

export const getMetricsEventsByFeature = (from: string, to: string) =>
  fetchJson<RangeResponse & { byFeature: MetricsEventByFeature[] }>(withRange('/api/metrics/dashboard/events-by-feature', from, to));

export const getMetricsErrors = (
  from: string,
  to: string,
  filters?: {
    feature?: string;
    errorCategory?: string;
    fingerprint?: string;
  }
) => {
  const params = new URLSearchParams({
    from,
    to,
  });
  if (filters?.feature) params.set('feature', filters.feature);
  if (filters?.errorCategory) params.set('errorCategory', filters.errorCategory);
  if (filters?.fingerprint) params.set('fingerprint', filters.fingerprint);

  return fetchJson<RangeResponse & {
    errors: MetricsErrorSummary[];
  }>(`/api/metrics/errors?${params.toString()}`);
};

export const getMetricsAiFailures = (
  from: string,
  to: string,
  filters?: {
    feature?: string;
    errorCategory?: string;
    fingerprint?: string;
  }
) => {
  const params = new URLSearchParams({
    from,
    to,
  });
  if (filters?.feature) params.set('feature', filters.feature);
  if (filters?.errorCategory) params.set('errorCategory', filters.errorCategory);
  if (filters?.fingerprint) params.set('fingerprint', filters.fingerprint);

  return fetchJson<RangeResponse & {
    events: MetricsErrorEvent[];
  }>(`/api/metrics/errors/ai-failures?${params.toString()}`);
};

export const getMetricsErrorDetail = (id: string) =>
  fetchJson<{
    error: MetricsErrorEvent;
    related: MetricsErrorEvent[];
  }>(`/api/metrics/errors/${encodeURIComponent(id)}`);
