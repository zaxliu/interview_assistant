import { useEffect, useRef } from 'react';
import { useFeishuOAuth } from './useFeishuOAuth';

const VALIDATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to periodically validate the Feishu token and refresh if needed.
 * Also validates when the user returns to the tab (window focus event).
 */
export const useTokenValidation = () => {
  const { isAuthenticated, refreshTokenIfNeeded } = useFeishuOAuth();
  const intervalRef = useRef<number | null>(null);

  // Validate token by attempting a refresh
  const validateToken = async () => {
    if (!isAuthenticated) return;

    try {
      const success = await refreshTokenIfNeeded();
      if (!success) {
        console.log('Token validation failed, user logged out');
      }
    } catch (error) {
      console.error('Token validation error:', error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear interval if not authenticated
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Set up periodic validation
    intervalRef.current = window.setInterval(() => {
      validateToken();
    }, VALIDATION_INTERVAL_MS);

    // Set up window focus validation
    const handleFocus = () => {
      validateToken();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated]);

  return { validateToken };
};
