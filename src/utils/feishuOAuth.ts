const FEISHU_OAUTH_STATE_PREFIX = 'feishu_oauth';
const FEISHU_OAUTH_REDIRECT_PATH = '/';

export const getFeishuOAuthRedirectUri = (
  locationLike: Pick<Location, 'origin'> = window.location
): string => `${locationLike.origin}${FEISHU_OAUTH_REDIRECT_PATH}`;

export const normalizeFeishuOAuthReturnTo = (returnTo?: string | null): string => {
  if (!returnTo) return FEISHU_OAUTH_REDIRECT_PATH;
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return FEISHU_OAUTH_REDIRECT_PATH;
  }
  return returnTo;
};

export const buildFeishuOAuthState = (returnTo?: string): string => {
  const safeReturnTo = normalizeFeishuOAuthReturnTo(returnTo);
  return `${FEISHU_OAUTH_STATE_PREFIX}:${encodeURIComponent(safeReturnTo)}`;
};

export const parseFeishuOAuthReturnTo = (state?: string | null): string | null => {
  if (!state || !state.startsWith(FEISHU_OAUTH_STATE_PREFIX)) {
    return null;
  }

  const prefix = `${FEISHU_OAUTH_STATE_PREFIX}:`;
  if (!state.startsWith(prefix)) {
    return FEISHU_OAUTH_REDIRECT_PATH;
  }

  const encodedReturnTo = state.slice(prefix.length);
  if (!encodedReturnTo) {
    return FEISHU_OAUTH_REDIRECT_PATH;
  }

  try {
    return normalizeFeishuOAuthReturnTo(decodeURIComponent(encodedReturnTo));
  } catch {
    return FEISHU_OAUTH_REDIRECT_PATH;
  }
};
