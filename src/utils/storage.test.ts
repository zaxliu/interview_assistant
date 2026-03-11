import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearStorage,
  getLegacyStorage,
  isLegacyMigrated,
  loadFromStorage,
  markLegacyMigrated,
  saveToStorage,
} from './storage';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('saves and loads user-scoped data', () => {
    saveToStorage({ positions: [{ id: 'p1' }], settings: {} }, 'user-1');

    expect(loadFromStorage('user-1')).toEqual({
      positions: [{ id: 'p1' }],
      settings: {},
    });
    expect(loadFromStorage('user-2')).toBeNull();
  });

  it('clears scoped storage', () => {
    saveToStorage({ positions: [{ id: 'p1' }], settings: {} }, 'user-1');
    clearStorage('user-1');
    expect(loadFromStorage('user-1')).toBeNull();
  });

  it('tracks legacy migration state', () => {
    expect(isLegacyMigrated()).toBe(false);
    markLegacyMigrated();
    expect(isLegacyMigrated()).toBe(true);
  });

  it('reads legacy global storage', () => {
    saveToStorage({ positions: [{ id: 'legacy' }], settings: {} });
    expect(getLegacyStorage()).toEqual({
      positions: [{ id: 'legacy' }],
      settings: {},
    });
  });
});
