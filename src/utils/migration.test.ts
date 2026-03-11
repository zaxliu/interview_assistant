import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettingsFromStorage, loadFromStorage, SETTINGS_STORAGE_KEY, STORAGE_KEY } from './storage';
import { migrateLegacyData } from './migration';

describe('migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy positions into user-scoped storage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        positions: [
          {
            id: 'position-1',
            title: 'Frontend Engineer',
            createdAt: '2026-03-10T00:00:00.000Z',
            source: 'manual',
            criteria: ['React'],
            candidates: [
              {
                id: 'candidate-1',
                name: 'Alice',
                status: 'pending',
                questions: [],
              },
            ],
          },
        ],
        settings: {},
      })
    );

    expect(migrateLegacyData('user-1')).toBe(true);
    expect(loadFromStorage('user-1')).toEqual({
      positions: [
        {
          id: 'position-1',
          title: 'Frontend Engineer',
          createdAt: '2026-03-10T00:00:00.000Z',
          source: 'manual',
          criteria: ['React'],
          userId: 'user-1',
          candidates: [
            {
              id: 'candidate-1',
              name: 'Alice',
              status: 'pending',
              questions: [],
              userId: 'user-1',
            },
          ],
        },
      ],
      settings: {},
    });
  });

  it('migrates legacy embedded settings into the current settings key', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        positions: [],
        settings: {
          aiApiKey: 'legacy-key',
          aiModel: 'gpt-4o',
          feishuAppId: 'app-id',
          interviewSplitRatio: 0.6,
        },
      })
    );

    expect(migrateLegacyData('user-1')).toBe(true);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(loadSettingsFromStorage()).toEqual({
      aiApiKey: 'legacy-key',
      aiModel: 'gpt-4o',
      feishuAppId: 'app-id',
      interviewSplitRatio: 0.6,
    });
  });

  it('does not overwrite existing user-scoped data', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        positions: [
          {
            id: 'legacy-position',
            title: 'Legacy Position',
            createdAt: '2026-03-10T00:00:00.000Z',
            source: 'manual',
            criteria: [],
            candidates: [],
          },
        ],
        settings: {},
      })
    );
    localStorage.setItem(
      `${STORAGE_KEY}-user-1`,
      JSON.stringify({
        positions: [
          {
            id: 'current-position',
            title: 'Current Position',
            createdAt: '2026-03-11T00:00:00.000Z',
            source: 'manual',
            criteria: [],
            candidates: [],
          },
        ],
        settings: {},
      })
    );

    expect(migrateLegacyData('user-1')).toBe(false);
    expect(loadFromStorage('user-1')).toEqual({
      positions: [
        {
          id: 'current-position',
          title: 'Current Position',
          createdAt: '2026-03-11T00:00:00.000Z',
          source: 'manual',
          criteria: [],
          candidates: [],
        },
      ],
      settings: {},
    });
  });
});
