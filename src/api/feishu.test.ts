import { describe, expect, it } from 'vitest';
import { extractFeishuDocTokenFromUrl } from './feishu';

describe('extractFeishuDocTokenFromUrl', () => {
  it('extracts token from a docx link', () => {
    expect(
      extractFeishuDocTokenFromUrl('https://horizonrobotics.feishu.cn/docx/CHFNdMLYdowr6dxlYWYcF1L6n6c?from=from_copylink')
    ).toBe('CHFNdMLYdowr6dxlYWYcF1L6n6c');
  });

  it('extracts token from a wiki link', () => {
    expect(
      extractFeishuDocTokenFromUrl('https://horizonrobotics.feishu.cn/wiki/GBBzwKlxKign1mk751CcGsudnKg')
    ).toBe('GBBzwKlxKign1mk751CcGsudnKg');
  });

  it('returns null for invalid link', () => {
    expect(extractFeishuDocTokenFromUrl('https://example.com/not-feishu')).toBeNull();
  });
});
