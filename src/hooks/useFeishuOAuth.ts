import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import {
  getOAuthAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from '@/api/feishu';

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

  // Handle OAuth callback - check for code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    // Skip if no code, not our OAuth flow, already processing, or code already used
    if (!code || !state?.startsWith('feishu_oauth') || isProcessingRef.current || processedCodes.has(code)) {
      return;
    }

    if (!feishuAppId || !feishuAppSecret) {
      return;
    }

    // Mark as processing and code as used
    isProcessingRef.current = true;
    processedCodes.add(code);

    // Parse return view from state (format: feishu_oauth:settings)
    const returnView = state.includes(':') ? state.split(':')[1] : null;

    // Exchange code for token
    const redirectUri = window.location.origin + window.location.pathname;
    console.log('Exchanging OAuth code for token...');
    exchangeCodeForToken(code, feishuAppId, feishuAppSecret, redirectUri)
      .then(async (tokens) => {
        setFeishuUserAccessToken(tokens.accessToken);
        setFeishuRefreshToken(tokens.refreshToken);

        // Fetch user info
        try {
          const user = await getUserInfo(tokens.accessToken);
          setFeishuUser(user);
          console.log('User info fetched:', user);
        } catch (error) {
          console.error('Failed to fetch user info:', error);
          // Don't fail the whole login if user info fetch fails
        }

        // Clear the code from URL, keep hash for return view
        const newUrl = returnView
          ? `${window.location.pathname}#${returnView}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        console.log('OAuth login successful!');
      })
      .catch((error) => {
        console.error('OAuth error:', error);
        let message = error.message;
        if (message.includes('Failed to fetch') || message.includes('Network error')) {
          message = '网络错误：无法连接飞书 API，请检查网络连接。';
        }
        alert(`飞书 OAuth 失败：${message}`);
        const newUrl = returnView
          ? `${window.location.pathname}#${returnView}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      })
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, [feishuAppId, feishuAppSecret, setFeishuUserAccessToken, setFeishuRefreshToken, setFeishuUser]);

  // Start OAuth flow
  const startOAuth = useCallback((returnTo?: string) => {
    if (!feishuAppId) {
      alert('请先填写飞书 App ID');
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    console.log('Starting OAuth with redirect_uri:', redirectUri);
    console.log('Make sure this exact URL is configured in Feishu app settings');

    // Include return view in state
    const state = returnTo ? `feishu_oauth:${returnTo}` : 'feishu_oauth';
    const authUrl = getOAuthAuthorizationUrl(feishuAppId, redirectUri, state);
    console.log('Authorization URL:', authUrl);

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
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
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
    user: feishuUser,
    startOAuth,
    refreshTokenIfNeeded,
    logout,
  };
};
