import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import {
  getOAuthAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from '@/api/feishu';
import {
  buildFeishuOAuthState,
  getFeishuOAuthRedirectUri,
  normalizeFeishuOAuthReturnTo,
  parseFeishuOAuthReturnTo,
} from '@/utils/feishuOAuth';
import { reportError, trackEvent } from '@/lib/analytics';

// Track processed OAuth codes to prevent duplicate processing
const processedCodes = new Set<string>();

export const useFeishuOAuth = () => {
  const {
    feishuAppId,
    feishuAppSecret,
    feishuUserAccessToken,
    feishuRefreshToken,
    feishuUser,
    setFeishuUserAccessToken,
    setFeishuRefreshToken,
    setFeishuUser,
  } = useSettingsStore();

  // Track if we're currently processing an OAuth callback
  const isProcessingRef = useRef(false);
  const isHydratingUserRef = useRef(false);

  const hydrateUserProfile = useCallback(async (accessToken: string) => {
    if (!accessToken || isHydratingUserRef.current) {
      return;
    }

    isHydratingUserRef.current = true;
    try {
      const user = await getUserInfo(accessToken);
      setFeishuUser(user);
      console.warn('User info fetched:', user);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    } finally {
      isHydratingUserRef.current = false;
    }
  }, [setFeishuUser]);

  // Handle OAuth callback - check for code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const returnTo = parseFeishuOAuthReturnTo(state);

    // Skip if no code, not our OAuth flow, already processing, or code already used
    if (!code || !returnTo || isProcessingRef.current || processedCodes.has(code)) {
      return;
    }

    if (!feishuAppId || !feishuAppSecret) {
      return;
    }

    // Mark as processing and code as used
    isProcessingRef.current = true;
    processedCodes.add(code);

    // Exchange code for token
    const redirectUri = getFeishuOAuthRedirectUri();
    console.warn('Exchanging OAuth code for token...');
    exchangeCodeForToken(code, feishuAppId, feishuAppSecret, redirectUri)
      .then(async (tokens) => {
        setFeishuUserAccessToken(tokens.accessToken);
        setFeishuRefreshToken(tokens.refreshToken);

        await hydrateUserProfile(tokens.accessToken);
        trackEvent({
          eventName: 'feishu_login_succeeded',
          feature: 'feishu_oauth',
          success: true,
        });

        // Clear callback params and return to where login was initiated.
        if (returnTo === window.location.pathname) {
          window.history.replaceState({}, '', returnTo);
        } else {
          window.location.assign(returnTo);
        }
        console.warn('OAuth login successful!');
      })
      .catch((error) => {
        console.error('OAuth error:', error);
        let message = error.message;
        if (message.includes('Failed to fetch') || message.includes('Network error')) {
          message = '网络错误：无法连接飞书 API，请检查网络连接。';
        }
        reportError({
          error,
          feature: 'feishu_oauth',
          errorCategory: 'feishu',
          eventName: 'feishu_login_failed',
          requestContext: {
            endpoint: '/api/feishu/authen/v2/oauth/token',
            method: 'POST',
            provider: 'feishu',
            operation: 'oauth_exchange_code',
          },
          reproContext: {
            route: window.location.pathname,
            hasFeishuAuth: Boolean(feishuUserAccessToken),
          },
          inputSnapshot: {
            returnTo,
          },
        });
        if (returnTo === window.location.pathname) {
          window.history.replaceState({}, '', returnTo);
        } else {
          window.location.assign(returnTo);
        }
      })
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, [
    feishuAppId,
    feishuAppSecret,
    feishuUserAccessToken,
    hydrateUserProfile,
    setFeishuUserAccessToken,
    setFeishuRefreshToken,
  ]);

  useEffect(() => {
    if (!feishuUserAccessToken || feishuUser) {
      return;
    }

    void hydrateUserProfile(feishuUserAccessToken);
  }, [feishuUser, feishuUserAccessToken, hydrateUserProfile]);

  // Start OAuth flow
  const startOAuth = useCallback((returnTo?: string) => {
    if (!feishuAppId) {
      console.error('Missing Feishu App ID before starting OAuth');
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const normalizedReturnTo = normalizeFeishuOAuthReturnTo(returnTo || currentPath);
    const redirectUri = getFeishuOAuthRedirectUri();
    console.warn('Starting OAuth with redirect_uri:', redirectUri);
    console.warn('Make sure this exact URL is configured in Feishu app settings');

    // Include return path in state
    const state = buildFeishuOAuthState(normalizedReturnTo);
    const authUrl = getOAuthAuthorizationUrl(feishuAppId, redirectUri, state);
    console.warn('Authorization URL:', authUrl);

    window.location.href = authUrl;
  }, [feishuAppId]);

  // Refresh token
  const refreshTokenIfNeeded = useCallback(async () => {
    if (!feishuRefreshToken || !feishuAppId || !feishuAppSecret) {
      return false;
    }

    try {
      const tokens = await refreshAccessToken(
        feishuRefreshToken,
        feishuAppId,
        feishuAppSecret
      );
      setFeishuUserAccessToken(tokens.accessToken);
      setFeishuRefreshToken(tokens.refreshToken);
      if (!feishuUser) {
        await hydrateUserProfile(tokens.accessToken);
      }
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      reportError({
        error,
        feature: 'feishu_oauth',
        errorCategory: 'feishu',
        eventName: 'feishu_refresh_token_failed',
        requestContext: {
          endpoint: '/api/feishu/authen/v2/oauth/token',
          method: 'POST',
          provider: 'feishu',
          operation: 'refresh_token',
        },
        reproContext: {
          route: window.location.pathname,
          hasFeishuAuth: Boolean(feishuUserAccessToken),
        },
      });
      // Clear invalid tokens and user info
      setFeishuUserAccessToken('');
      setFeishuRefreshToken('');
      setFeishuUser(null);
      return false;
    }
  }, [
    feishuRefreshToken,
    feishuAppId,
    feishuAppSecret,
    feishuUser,
    feishuUserAccessToken,
    hydrateUserProfile,
    setFeishuUserAccessToken,
    setFeishuRefreshToken,
    setFeishuUser,
  ]);

  // Logout - clear tokens and user info
  const logout = useCallback(() => {
    setFeishuUserAccessToken('');
    setFeishuRefreshToken('');
    setFeishuUser(null);
  }, [setFeishuUserAccessToken, setFeishuRefreshToken, setFeishuUser]);

  return {
    isAuthenticated: !!feishuUserAccessToken,
    isProfileLoaded: !!feishuUser,
    user: feishuUser,
    startOAuth,
    refreshTokenIfNeeded,
    logout,
  };
};
