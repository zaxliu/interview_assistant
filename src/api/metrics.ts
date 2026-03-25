export interface MetricsAdminUser {
  id: string;
  name: string;
  avatarUrl?: string;
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
