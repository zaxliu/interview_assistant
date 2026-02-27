import type { Position, Candidate } from '@/types';
import { getLegacyStorage, saveToStorage, isLegacyMigrated, markLegacyMigrated } from './storage';

/**
 * Migrate legacy (global) data to user-specific storage.
 * This should be called when a user logs in for the first time.
 *
 * @param userId The user ID to associate with the migrated data
 * @returns true if migration was performed, false if already migrated or no data to migrate
 */
export const migrateLegacyData = (userId: string): boolean => {
  // Check if already migrated
  if (isLegacyMigrated()) {
    console.log('Legacy data already migrated, skipping');
    return false;
  }

  // Get legacy data
  const legacyData = getLegacyStorage();
  if (!legacyData?.positions || !Array.isArray(legacyData.positions)) {
    console.log('No legacy data to migrate');
    markLegacyMigrated();
    return false;
  }

  const positions = legacyData.positions as Position[];

  // Check if there's any data to migrate
  if (positions.length === 0) {
    console.log('No positions to migrate');
    markLegacyMigrated();
    return false;
  }

  console.log(`Migrating ${positions.length} positions to user ${userId}`);

  // Add userId to all positions and their candidates
  const migratedPositions = positions.map((position) => ({
    ...position,
    userId,
    candidates: position.candidates.map((candidate: Candidate) => ({
      ...candidate,
      userId,
    })),
  }));

  // Save to user-specific storage
  saveToStorage({ positions: migratedPositions, settings: {} }, userId);

  // Mark as migrated
  markLegacyMigrated();

  console.log('Migration completed successfully');
  return true;
};
