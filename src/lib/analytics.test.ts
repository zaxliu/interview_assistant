import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError, trackAppOpenedOnce, trackEvent, usageFromAIUsage } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('tracks app_opened only once per session', () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    trackAppOpenedOnce();
    trackAppOpenedOnce();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it('posts analytics events through beacon when available', () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    trackEvent({
      eventName: 'question_generation_succeeded',
      success: true,
      durationMs: 1200,
    });

    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/metrics/events',
      expect.any(Blob)
    );
  });

  it('maps AI usage fields to analytics token fields', () => {
    expect(usageFromAIUsage({ input: 12, cached: 3, output: 9 })).toEqual({
      inputTokens: 12,
      cachedTokens: 3,
      outputTokens: 9,
    });
  });

  it('reports structured error payloads with sanitized snapshots', async () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    trackEvent({
      eventName: 'resume_import_started',
      feature: 'resume_import',
      success: true,
      details: {
        method: 'url',
      },
    });

    reportError({
      error: new Error('Request failed with status 401'),
      feature: 'resume_import',
      errorCategory: 'wintalent',
      requestContext: {
        endpoint: '/api/wintalent/download',
        method: 'POST',
        httpStatus: 401,
      },
      inputSnapshot: {
        wintalentLink: 'https://example.com/path?k=secret-token',
        accessToken: 'abc',
      },
    });

    const lastCall = sendBeacon.mock.calls[sendBeacon.mock.calls.length - 1] as unknown as [string, Blob] | undefined;
    expect(lastCall).toBeTruthy();
    const blob = lastCall?.[1];
    expect(blob).toBeTruthy();
    const rawBody = await blob!.text();
    const payload = JSON.parse(rawBody);

    expect(payload.eventType).toBe('error');
    expect(payload.errorCategory).toBe('wintalent');
    expect(payload.requestContext).toMatchObject({
      endpoint: '/api/wintalent/download',
      method: 'POST',
      httpStatus: 401,
    });
    expect(payload.inputSnapshot).toMatchObject({
      wintalentLink: 'https://example.com/path?[redacted]',
      accessToken: '[redacted]',
    });
    expect(payload.breadcrumbs).toHaveLength(1);
  });
});
