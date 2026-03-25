import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAppOpenedOnce, trackEvent, usageFromAIUsage } from './analytics';

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
});
