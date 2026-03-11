import type { Position, Candidate } from '@/types';
import {
  getLegacyStorage,
  loadFromStorage,
  loadSettingsFromStorage,
  saveSettingsToStorage,
  saveToStorage,
  markLegacyMigrated,
} from './storage';

type LegacySettings = {
  aiApiKey?: string;
  aiModel?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuUserAccessToken?: string;
  feishuRefreshToken?: string;
  feishuUser?: unknown;
  interviewSplitRatio?: number;
};

/**
 * Migrate legacy (global) data to user-specific storage.
 * This should be called when a user logs in for the first time.
 *
 * @param userId The user ID to associate with the migrated data
 * @returns true if migration was performed, false if already migrated or no data to migrate
 */
export const migrateLegacyData = (userId: string): boolean => {
  const legacyData = getLegacyStorage();
  const existingUserData = loadFromStorage(userId);
  const existingSettings = loadSettingsFromStorage<LegacySettings>();
  const hasUserPositions =
    Array.isArray(existingUserData?.positions) && existingUserData.positions.length > 0;
  const legacyPositions = Array.isArray(legacyData?.positions) ? (legacyData.positions as Position[]) : [];
  const hasLegacyPositions = legacyPositions.length > 0;

  let migrated = false;

  if (!hasUserPositions && hasLegacyPositions) {
    const migratedPositions = legacyPositions.map((position) => ({
      ...position,
      userId,
      candidates: Array.isArray(position.candidates)
        ? position.candidates.map((candidate: Candidate) => ({
            ...candidate,
            userId,
          }))
        : [],
    }));

    saveToStorage(
      {
        positions: migratedPositions,
        settings: existingUserData?.settings ?? legacyData?.settings ?? {},
      },
      userId
    );
    migrated = true;
  }

  const legacySettings =
    legacyData?.settings && typeof legacyData.settings === 'object'
      ? (legacyData.settings as LegacySettings)
      : null;
  const hasLegacySettings = Boolean(legacySettings && Object.keys(legacySettings).length > 0);

  if (!existingSettings && hasLegacySettings && legacySettings) {
    saveSettingsToStorage(legacySettings);
    migrated = true;
  }

  if (hasLegacyPositions || hasLegacySettings) {
    markLegacyMigrated();
  }

  return migrated;
};
