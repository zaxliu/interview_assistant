import { describe, expect, it } from 'vitest';
import {
  buildFeishuOAuthState,
  getFeishuOAuthRedirectUri,
  normalizeFeishuOAuthReturnTo,
  parseFeishuOAuthReturnTo,
} from './feishuOAuth';

describe('feishuOAuth utils', () => {
  it('builds root redirect uri from origin', () => {
    expect(getFeishuOAuthRedirectUri({ origin: 'https://example.com' })).toBe('https://example.com/');
  });

  it('normalizes unsafe return target to root', () => {
    expect(normalizeFeishuOAuthReturnTo('https://evil.com')).toBe('/');
    expect(normalizeFeishuOAuthReturnTo('//evil.com/path')).toBe('/');
  });

  it('keeps safe in-app return target', () => {
    expect(normalizeFeishuOAuthReturnTo('/settings')).toBe('/settings');
    expect(normalizeFeishuOAuthReturnTo('/positions/123?resume=hidden#section')).toBe('/positions/123?resume=hidden#section');
  });

  it('round-trips encoded state with return target', () => {
    const state = buildFeishuOAuthState('/positions/1?foo=bar#note');
    expect(parseFeishuOAuthReturnTo(state)).toBe('/positions/1?foo=bar#note');
  });

  it('returns root for malformed or legacy state payload', () => {
    expect(parseFeishuOAuthReturnTo('feishu_oauth')).toBe('/');
    expect(parseFeishuOAuthReturnTo('feishu_oauth:%E0%A4%A')).toBe('/');
  });

  it('returns null for non-feishu oauth state', () => {
    expect(parseFeishuOAuthReturnTo('other_state')).toBeNull();
    expect(parseFeishuOAuthReturnTo(null)).toBeNull();
  });
});
