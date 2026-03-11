export const STORAGE_KEY = 'interview-assistant-data';
export const SETTINGS_STORAGE_KEY = 'interview-assistant-settings';
const LEGACY_MIGRATED_KEY = 'interview-assistant-migrated';

export interface StorageData {
  positions: unknown[];
  settings: unknown;
}

/**
 * Get user-specific storage key
 */
const getUserStorageKey = (userId: string): string => {
  return `${STORAGE_KEY}-${userId}`;
};

/**
 * Save data to storage (user-scoped if userId provided)
 */
export const saveToStorage = (data: StorageData, userId?: string): void => {
  try {
    const key = userId ? getUserStorageKey(userId) : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

/**
 * Load data from storage (user-scoped if userId provided)
 */
export const loadFromStorage = (userId?: string): StorageData | null => {
  try {
    // If userId provided, try user-specific storage first
    if (userId) {
      const userData = localStorage.getItem(getUserStorageKey(userId));
      if (userData) {
        return JSON.parse(userData);
      }
      return null;
    }

    // Fall back to global storage
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return null;
  }
};

/**
 * Save settings to dedicated storage
 */
export const saveSettingsToStorage = (settings: unknown): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to localStorage:', error);
  }
};

/**
 * Load settings from dedicated storage
 */
export const loadSettingsFromStorage = <T = unknown>(): T | null => {
  try {
    const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return data ? (JSON.parse(data) as T) : null;
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
    return null;
  }
};

/**
 * Clear storage (user-scoped if userId provided)
 */
export const clearStorage = (userId?: string): void => {
  try {
    const key = userId ? getUserStorageKey(userId) : STORAGE_KEY;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};

/**
 * Check if legacy data has been migrated
 */
export const isLegacyMigrated = (): boolean => {
  return localStorage.getItem(LEGACY_MIGRATED_KEY) === 'true';
};

/**
 * Mark legacy data as migrated
 */
export const markLegacyMigrated = (): void => {
  localStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
};

/**
 * Get legacy (global) storage data for migration
 */
export const getLegacyStorage = (): StorageData | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load legacy storage:', error);
    return null;
  }
};
