import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.WINTALENT_PROXY_PORT || 8787);
const HOST = process.env.WINTALENT_PROXY_HOST || '127.0.0.1';
const ORIGIN = 'https://www.wintalent.cn';
const WINTALENT_RESUME_UNAVAILABLE_MESSAGE =
  '当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!';
const WINTALENT_RESUME_UNAVAILABLE_KEYWORD = '当前简历已流转到其他环节或已被删除';
const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  LINK_EXPIRED: 'LINK_EXPIRED',
  RESUME_UNAVAILABLE: 'RESUME_UNAVAILABLE',
  NO_ORIGINAL_RESUME_PERMISSION: 'NO_ORIGINAL_RESUME_PERMISSION',
  JD_PERMISSION_DENIED: 'JD_PERMISSION_DENIED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PDF_FLOW_DATA_INCOMPLETE: 'PDF_FLOW_DATA_INCOMPLETE',
  PDF_FETCH_FAILED: 'PDF_FETCH_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

const WINTALENT_INTERVIEW_RESULT_CODE = {
  PASS: 1,
  FAIL: 2,
  PENDING: 4,
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function formatFetchError(url, error) {
  const parts = [`请求 ${url} 失败`];
  const message = String(error?.message || error || '').trim();
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
  const causeCode = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const causeMessage = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';

  if (causeCode) {
    parts.push(`code=${causeCode}`);
  }

  if (causeMessage && causeMessage !== message) {
    parts.push(causeMessage);
  } else if (message) {
    parts.push(message);
  }

  return parts.join(' | ');
}

function extractResumeUnavailableMessage(rawText) {
  if (!rawText) return null;
  const candidates = [
    String(rawText),
    decodeHtmlEntities(String(rawText)),
    stripHtml(String(rawText)),
  ].map((value) => value.replace(/\s+/g, ''));

  if (candidates.some((value) => value.includes(WINTALENT_RESUME_UNAVAILABLE_MESSAGE.replace(/\s+/g, '')))) {
    return WINTALENT_RESUME_UNAVAILABLE_MESSAGE;
  }
  if (candidates.some((value) => value.includes(WINTALENT_RESUME_UNAVAILABLE_KEYWORD.replace(/\s+/g, '')))) {
    return WINTALENT_RESUME_UNAVAILABLE_MESSAGE;
  }
  return null;
}

class CookieJar {
  constructor() {
    this.cookies = [];
  }

  setFromHeader(setCookieHeader, requestUrl) {
    const parts = splitSetCookieHeader(setCookieHeader);
    for (const cookieStr of parts) {
      this.#setSingleCookie(cookieStr, requestUrl);
    }
  }

  #setSingleCookie(cookieStr, requestUrl) {
    const segments = cookieStr.split(';').map((x) => x.trim());
    if (!segments[0] || !segments[0].includes('=')) return;

    const [name, ...valueRest] = segments[0].split('=');
    const value = valueRest.join('=');
    const reqUrl = new URL(requestUrl);
    const defaults = {
      name,
      value,
      domain: reqUrl.hostname,
      hostOnly: true,
      path: defaultCookiePath(reqUrl.pathname),
      secure: false,
      expiresAt: null,
    };

    for (const attr of segments.slice(1)) {
      const [rawKey, ...rawVal] = attr.split('=');
      const key = rawKey.toLowerCase();
      const val = rawVal.join('=');

      if (key === 'domain' && val) {
        defaults.domain = val.replace(/^\./, '').toLowerCase();
        defaults.hostOnly = false;
      } else if (key === 'path' && val) {
        defaults.path = val;
      } else if (key === 'secure') {
        defaults.secure = true;
      } else if (key === 'max-age') {
        const sec = Number(val);
        if (Number.isFinite(sec)) {
          defaults.expiresAt = Date.now() + sec * 1000;
        }
      } else if (key === 'expires') {
        const ts = Date.parse(val);
        if (!Number.isNaN(ts)) {
          defaults.expiresAt = ts;
        }
      }
    }

    this.cookies = this.cookies.filter((c) => {
      return !(c.name === defaults.name && c.domain === defaults.domain && c.path === defaults.path);
    });

    if (defaults.expiresAt !== null && defaults.expiresAt <= Date.now()) {
      return;
    }

    this.cookies.push(defaults);
  }

  getCookie(name) {
    const now = Date.now();
    const matches = this.cookies
      .filter((c) => c.name === name && (c.expiresAt === null || c.expiresAt > now))
      .sort((a, b) => b.path.length - a.path.length);
    return matches[0]?.value ?? null;
  }

  getHeader(urlStr) {
    const now = Date.now();
    const url = new URL(urlStr);
    const matches = this.cookies.filter((cookie) => {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) return false;
      if (cookie.secure && url.protocol !== 'https:') return false;
      if (!pathMatch(url.pathname, cookie.path)) return false;
      if (cookie.hostOnly) {
        return url.hostname === cookie.domain;
      }
      return domainMatch(url.hostname, cookie.domain);
    });

    matches.sort((a, b) => b.path.length - a.path.length);
    return matches.map((c) => `${c.name}=${c.value}`).join('; ');
  }
}

function splitSetCookieHeader(headerValue) {
  if (!headerValue) return [];
  if (Array.isArray(headerValue)) return headerValue;

  const list = [];
  let current = '';
  let inExpires = false;

  for (let i = 0; i < headerValue.length; i += 1) {
    const ch = headerValue[i];
    current += ch;

    if (!inExpires && current.toLowerCase().endsWith('expires=')) {
      inExpires = true;
    } else if (inExpires && ch === ';') {
      inExpires = false;
    } else if (!inExpires && ch === ',') {
      const next = headerValue.slice(i + 1);
      if (/^\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+=/.test(next)) {
        list.push(current.slice(0, -1).trim());
        current = '';
      }
    }
  }

  if (current.trim()) list.push(current.trim());
  return list;
}

function defaultCookiePath(pathname) {
  if (!pathname || !pathname.startsWith('/')) return '/';
  if (pathname === '/') return '/';
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return pathname.slice(0, lastSlash);
}

function domainMatch(hostname, domain) {
  const host = hostname.toLowerCase();
  const dom = domain.toLowerCase();
  return host === dom || host.endsWith(`.${dom}`);
}

function pathMatch(pathname, cookiePath) {
  if (pathname === cookiePath) return true;
  return pathname.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`);
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.get('set-cookie');
  return raw ? splitSetCookieHeader(raw) : [];
}

async function requestWithJar(jar, url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    referer,
    followRedirects = 0,
  } = options;

  let currentUrl = url;
  let currentMethod = method;
  let currentBody = body;
  let currentHeaders = { ...headers };
  const history = [];

  for (let i = 0; i <= followRedirects; i += 1) {
    const cookieHeader = jar.getHeader(currentUrl);
    const reqHeaders = { ...currentHeaders };
    if (cookieHeader) reqHeaders.Cookie = cookieHeader;
    if (referer && !reqHeaders.Referer) reqHeaders.Referer = referer;

    let res;
    try {
      res = await fetch(currentUrl, {
        method: currentMethod,
        headers: reqHeaders,
        body: currentBody,
        redirect: 'manual',
      });
    } catch (error) {
      throw new Error(formatFetchError(currentUrl, error));
    }

    for (const setCookie of getSetCookieHeaders(res.headers)) {
      jar.setFromHeader(setCookie, currentUrl);
    }

    history.push({ url: currentUrl, status: res.status });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location');
    if (!isRedirect || !location || i === followRedirects) {
      return { res, url: currentUrl, history };
    }

    const nextUrl = new URL(location, currentUrl).toString();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
      currentMethod = 'GET';
      currentBody = undefined;
      currentHeaders = {};
    }
    currentUrl = nextUrl;
  }

  throw new Error('Unexpected redirect handling state');
}

function extractShowResumeUrl(history, fallbackUrl) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].url.includes('/interviewPlatform/newpc/jsp/showResume.html')) {
      return history[i].url;
    }
  }
  return fallbackUrl;
}

function getShowResumeParams(showResumeUrl) {
  const url = new URL(showResumeUrl);
  const q = url.searchParams;
  return {
    currentApplyId: q.get('currentApplyId') || '',
    moduleCode: q.get('moduleCode') || '',
    resumeType: q.get('resumeType') || '1',
    fromMessage: q.get('fromMessage') || 'false',
    mailOperateId: q.get('mailOperateId') || '',
    batchKey: q.get('batchKey') || '',
    sendToCCBool: q.get('sendToCCBool') || 'false',
    isShowAnalyzeResume: q.get('isShowAnalyzeResume') || '1',
    isShowOriginalResume: q.get('isShowOriginalResume') || '1',
  };
}

function encodeForm(data) {
  return new URLSearchParams(data).toString();
}

async function postFormJson(jar, url, formObj, referer) {
  const { res } = await requestWithJar(jar, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: encodeForm(formObj),
    referer,
  });
  const text = await res.text();
  const resumeUnavailableMessage = extractResumeUnavailableMessage(text);
  if (!res.ok) {
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error(`HTTP ${res.status} calling ${url}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
}

async function postFormText(jar, url, formObj, referer) {
  const { res } = await requestWithJar(jar, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: encodeForm(formObj),
    referer,
  });
  const text = await res.text();
  const resumeUnavailableMessage = extractResumeUnavailableMessage(text);
  if (!res.ok) {
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error(`HTTP ${res.status} calling ${url}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function createTokenizedUrl(jar, createTokenUrl, rawPath, referer) {
  const createTokenEndpoint = normalizeTokenEndpoint(createTokenUrl);
  if (!createTokenEndpoint) {
    throw new Error('createTokenUrl 无效，无法继续 token 链路');
  }

  const json = await postFormJson(
    jar,
    createTokenEndpoint,
    { url: rawPath },
    referer
  );
  if (!json?.tokenUrl) {
    throw new Error(`createToken failed for ${rawPath}`);
  }
  return new URL(json.tokenUrl, ORIGIN).toString();
}

function decodeMaybeEncodedUrl(value) {
  let result = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}

function normalizeTokenEndpoint(rawValue) {
  if (!rawValue) return null;

  let value = String(rawValue).trim().replace(/^["']|["']$/g, '');
  if (!value) return null;

  // Common escaping patterns seen in inline script or cookie payloads.
  value = value.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  value = decodeMaybeEncodedUrl(value);

  try {
    return new URL(value, ORIGIN).toString();
  } catch {
    return null;
  }
}

function extractCreateTokenUrlFromHtml(html) {
  if (!html) return null;

  const patterns = [
    /createTokenUrl\s*[:=]\s*['"]([^"'<>]+)['"]/i,
    /["']createTokenUrl["']\s*:\s*["']([^"']+)["']/i,
    /createTokenUrl=([^"'&\s<>]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const tokenEndpoint = normalizeTokenEndpoint(match?.[1] || '');
    if (tokenEndpoint) return tokenEndpoint;
  }

  return null;
}

async function resolveCreateTokenEndpoint(jar, showResumeUrl, entryResponse) {
  const cookieValue = normalizeTokenEndpoint(jar.getCookie('createTokenUrl'));
  if (cookieValue) return cookieValue;

  const entryHtml = entryResponse ? await entryResponse.clone().text().catch(() => '') : '';
  const entryResumeUnavailableMessage = extractResumeUnavailableMessage(entryHtml);
  if (entryResumeUnavailableMessage) {
    throw new Error(entryResumeUnavailableMessage);
  }
  const fromEntry = extractCreateTokenUrlFromHtml(entryHtml);
  if (fromEntry) return fromEntry;

  const showResumeEntry = await requestWithJar(jar, showResumeUrl, {
    followRedirects: 2,
    referer: showResumeUrl,
  });

  const refreshedCookieValue = normalizeTokenEndpoint(jar.getCookie('createTokenUrl'));
  if (refreshedCookieValue) return refreshedCookieValue;

  const showResumeHtml = await showResumeEntry.res.text().catch(() => '');
  const showResumeResumeUnavailableMessage = extractResumeUnavailableMessage(showResumeHtml);
  if (showResumeResumeUnavailableMessage) {
    throw new Error(showResumeResumeUnavailableMessage);
  }
  return extractCreateTokenUrlFromHtml(showResumeHtml);
}

function getErrorStatus(error) {
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();

  if (message.includes('interviewUrl is required') || message.includes('Invalid JSON body')) return 400;
  if (message.includes(WINTALENT_RESUME_UNAVAILABLE_KEYWORD)) return 400;
  if (message.includes('showResume') || message.includes('链接可能已失效')) return 400;
  if (message.includes('未拿到 postId/recruitType')) return 422;
  if (message.includes('未拿到 resumeOriginalInfoUrl') || message.includes('无原始简历权限')) return 403;
  if (message.includes('无职位JD权限')) return 403;
  if (message.includes('未拿到 createTokenUrl') || message.includes('createTokenUrl 无效')) return 401;
  if (lower.includes('http 401') || lower.includes('unauthorized')) return 401;
  if (lower.includes('http 403') || lower.includes('forbidden')) return 403;
  if (lower.includes('http 404')) return 404;
  if (message.includes('拉取 PDF 失败')) return 502;
  return 500;
}

function getErrorCode(error) {
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();

  if (message.includes('interviewUrl is required') || message.includes('Invalid JSON body')) {
    return ERROR_CODES.BAD_REQUEST;
  }
  if (message.includes(WINTALENT_RESUME_UNAVAILABLE_KEYWORD)) {
    return ERROR_CODES.RESUME_UNAVAILABLE;
  }
  if (message.includes('showResume') || message.includes('链接可能已失效')) {
    return ERROR_CODES.LINK_EXPIRED;
  }
  if (message.includes('未拿到 postId/recruitType') || message.includes('currentResumeInfo 返回数据不完整')) {
    return ERROR_CODES.PDF_FLOW_DATA_INCOMPLETE;
  }
  if (message.includes('未拿到 resumeOriginalInfoUrl') || message.includes('无原始简历权限')) {
    return ERROR_CODES.NO_ORIGINAL_RESUME_PERMISSION;
  }
  if (message.includes('无职位JD权限')) {
    return ERROR_CODES.JD_PERMISSION_DENIED;
  }
  if (message.includes('未拿到 createTokenUrl') || message.includes('createTokenUrl 无效')) {
    return ERROR_CODES.AUTH_REQUIRED;
  }
  if (lower.includes('http 401') || lower.includes('unauthorized')) {
    return ERROR_CODES.AUTH_REQUIRED;
  }
  if (message.includes('拉取 PDF 失败')) {
    return ERROR_CODES.PDF_FETCH_FAILED;
  }
  return ERROR_CODES.INTERNAL_ERROR;
}

function sendProxyError(res, error) {
  sendJson(res, getErrorStatus(error), {
    ok: false,
    code: getErrorCode(error),
    error: String(error?.message || error),
  });
}

function appendQueryParam(url, key, value) {
  const u = new URL(url);
  if (!u.searchParams.has(key)) {
    u.searchParams.set(key, value);
  } else if (u.searchParams.get(key) !== value) {
    u.searchParams.set(key, value);
  }
  return u.toString();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlMultiline(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractResumeTextFromResumeDetailHtml(html) {
  const source = String(html || '');
  if (!source.trim()) return '';

  const sections = [];
  const itemPattern = /<div class="jlxqItem"[\s\S]*?<\/div>\s*(?=<div class="jlxqItem"|$)/gi;
  let match;

  while ((match = itemPattern.exec(source)) !== null) {
    const block = match[0];
    const titleMatch = block.match(/<p class="title"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/p>/i);
    const title = stripHtmlMultiline(titleMatch?.[1] || '');
    const blockText = stripHtmlMultiline(block);
    if (!title || !blockText) continue;

    const textWithoutTitle = blockText.startsWith(title)
      ? blockText.slice(title.length).trim()
      : blockText;
    if (!textWithoutTitle) continue;

    sections.push(`${title}\n${textWithoutTitle}`);
  }

  if (sections.length > 0) {
    return sections.join('\n\n').trim();
  }

  return stripHtmlMultiline(source);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatSummarySections(result) {
  const lines = [];
  const overallComment = String(result?.summary?.overall_comment || '').trim();
  if (overallComment) {
    lines.push(overallComment);
  }

  const appendList = (title, items) => {
    const list = Array.isArray(items)
      ? items.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (list.length === 0) return;
    if (lines.length > 0) lines.push('');
    lines.push(`${title}：`);
    for (const item of list) {
      lines.push(`- ${item}`);
    }
  };

  appendList('优势', result?.additional_info?.strengths);
  appendList('顾虑', result?.additional_info?.concerns);
  appendList('后续跟进问题', result?.additional_info?.follow_up_questions);

  return lines.join('\n').trim();
}

function mapInterviewConclusionToStatus(value) {
  switch (String(value || '').trim()) {
    case '通过':
      return WINTALENT_INTERVIEW_RESULT_CODE.PASS;
    case '不通过':
      return WINTALENT_INTERVIEW_RESULT_CODE.FAIL;
    default:
      return WINTALENT_INTERVIEW_RESULT_CODE.PENDING;
  }
}

function extractOperationUrlFromJavascript(value) {
  const text = String(value || '');
  const match = text.match(/openResumeEvaluate\('([^']+)'/i);
  if (!match?.[1]) {
    return null;
  }
  return new URL(match[1], ORIGIN).toString();
}

function resolveWintalentOptionCode(item, preferred) {
  const options = Array.isArray(item?.evDicInfoVOList) ? item.evDicInfoVOList : [];
  if (options.length === 0) return null;

  if (typeof preferred === 'number') {
    const option = options[Math.min(Math.max(preferred - 1, 0), options.length - 1)];
    return option?.code || null;
  }

  const normalized = String(preferred || '').trim().toLowerCase();
  if (!normalized) return null;

  const option = options.find((entry) => {
    const candidates = [
      entry?.name,
      entry?.cnName,
      entry?.label,
      entry?.text,
      entry?.displayName,
      entry?.value,
    ]
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    return candidates.includes(normalized);
  });

  return option?.code || null;
}

function buildEvaluationInfosFromResult(formData, result) {
  const groups = Array.isArray(formData?.informationSetList) ? formData.informationSetList : [];
  const dimensionMap = new Map(
    (Array.isArray(result?.evaluation_dimensions) ? result.evaluation_dimensions : [])
      .map((item) => [String(item?.dimension || '').trim(), item])
      .filter(([key]) => key)
  );

  const evaluationInfos = [];
  const pushInfo = (item, itemValue) => {
    if (itemValue === null || itemValue === undefined) return;
    if (typeof itemValue === 'string' && !itemValue.trim()) return;
    evaluationInfos.push({
      fillType: item.fillType,
      itemId: item.uniqueKey || item.id,
      itemValue,
      memo: '',
    });
  };

  for (const group of groups) {
    const groupName = String(group?.name || group?.title || '').trim();
    const dimension = dimensionMap.get(groupName);
    const items = Array.isArray(group?.informationItemList) ? group.informationItemList : [];

    if (dimension) {
      for (const item of items) {
        if (item.fillType === 3 || item.fillType === 4) {
          pushInfo(item, resolveWintalentOptionCode(item, Number(dimension.score || 0)));
        } else if (item.fillType === 6) {
          pushInfo(item, String(dimension.assessment_points || '').trim());
        }
      }
      continue;
    }

    if (groupName === '综合评分') {
      const item = items[0];
      if (item) {
        pushInfo(item, resolveWintalentOptionCode(item, Number(result?.summary?.comprehensive_score || 0)));
      }
      continue;
    }

    if (groupName === '建议职级') {
      const item = items[0];
      const suggestedLevel = String(result?.summary?.suggested_level || '').trim();
      if (item && suggestedLevel) {
        pushInfo(item, resolveWintalentOptionCode(item, suggestedLevel));
      }
      continue;
    }

    if (groupName === '总评') {
      const item = items.find((entry) => entry.fillType === 6) || items[0];
      if (item) {
        pushInfo(item, formatSummarySections(result));
      }
      continue;
    }

    if (groupName === '面试结论') {
      for (const item of items) {
        if (String(item?.name || '').includes('强烈建议') && result?.summary?.is_strongly_recommended) {
          pushInfo(item, resolveWintalentOptionCode(item, 1));
        }
      }
    }
  }

  return evaluationInfos;
}

function buildLegacyEvaluationAutoSavePayload(formData, evaluationContext, result) {
  const evaluateStatus = mapInterviewConclusionToStatus(
    result?.summary?.interview_conclusion || result?.interview_info?.overall_result
  );
  const overallComment = formatSummarySections(result);
  const evaluationInfos = buildEvaluationInfosFromResult(formData, result);
  const evInfoStr = evaluationInfos
    .map((item) => `${item.itemId}::${item.itemValue}`)
    .join(';;');

  return {
    planId: String(formData?.planId || evaluationContext?.evaluationPayload?.planId || ''),
    interviewerId: String(formData?.interviewerId || evaluationContext?.evaluationPayload?.interviewerId || ''),
    evInfoStr: evInfoStr ? `${evInfoStr};;` : '',
    memoInfoStr: '',
    score: '0',
    type: '1',
    interviewerInfo: '',
    isToReplaceEv: 'false',
    questionAnswerInfo: '',
    interviewResult: evaluateStatus ? String(evaluateStatus) : '',
    noPassReason: '',
    noPassOtherReason: evaluateStatus === WINTALENT_INTERVIEW_RESULT_CODE.FAIL ? overallComment : '',
    pendingRemark: evaluateStatus === WINTALENT_INTERVIEW_RESULT_CODE.PENDING ? overallComment : '',
    aiEvaluation: 'false',
  };
}

function buildCandidateLinkFallbackUrl(showResumeUrl) {
  return appendQueryParam(showResumeUrl, 'operateToEv', 'true');
}

function looksLikeMeaningfulReviewText(value) {
  const text = normalizeWhitespace(value);
  if (!text || text.length < 8) return false;
  if (/^(暂无|无|未填写|--|-|n\/a|null|undefined)$/i.test(text)) return false;
  return true;
}

function pickString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = normalizeWhitespace(value);
      if (text) return text;
    }
  }
  return '';
}

function collectReviewSummary(obj) {
  const preferredKeys = [
    'evaluateContent',
    'evaluationContent',
    'commentContent',
    'interviewComment',
    'comment',
    'remark',
    'remarks',
    'summary',
    'content',
    'advantage',
    'advantages',
    'disadvantage',
    'disadvantages',
    'reason',
    'suggestion',
  ];

  const pieces = [];
  for (const key of preferredKeys) {
    const value = obj?.[key];
    if (Array.isArray(value)) {
      const text = value.map((item) => normalizeWhitespace(item)).filter(looksLikeMeaningfulReviewText).join('\n');
      if (text) pieces.push(`${key}: ${text}`);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const text = normalizeWhitespace(value);
      if (looksLikeMeaningfulReviewText(text)) {
        pieces.push(text);
      }
    }
  }

  if (pieces.length > 0) {
    return Array.from(new Set(pieces)).join('\n');
  }

  const fallback = Object.entries(obj || {})
    .filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) || typeof value === 'object') return false;
      if (/(^id$|Id$|code$|url$|name$|time$|date$|status$|result$|stage$|round$|type$)/i.test(key)) {
        return false;
      }
      return true;
    })
    .map(([key, value]) => `${key}: ${normalizeWhitespace(value)}`)
    .filter((line) => looksLikeMeaningfulReviewText(line));

  return fallback.join('\n');
}

function isPotentialReviewObject(item, path) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const pathText = path.join('.').toLowerCase();
  const keys = Object.keys(item).join('|').toLowerCase();
  const hint = `${pathText}|${keys}`;
  const hasReviewHint = [
    'interview',
    'history',
    'evaluate',
    'evaluation',
    'comment',
    'remark',
    'assessment',
    'review',
    '面试',
    '面评',
    '评语',
    '评价',
    '记录',
  ].some((keyword) => hint.includes(keyword));
  if (!hasReviewHint) return false;

  return looksLikeMeaningfulReviewText(collectReviewSummary(item));
}

function extractHistoricalInterviewReviews(data) {
  const reviews = [];
  const seen = new Set();

  function visit(node, path = []) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        if (isPotentialReviewObject(item, path)) {
          const summary = collectReviewSummary(item);
          const review = {
            id: pickString(item, ['id', 'interviewId', 'evaluateId', 'recordId']) || `${path.join('.')}:${index}`,
            source: 'wintalent',
            stageName: pickString(item, ['stageName', 'roundName', 'interviewRound', 'processName', 'processNodeName']),
            interviewer: pickString(item, ['interviewer', 'interviewerName', 'userName', 'createUserName', 'employeeName']),
            interviewTime: pickString(item, ['interviewTime', 'interviewDate', 'createTime', 'gmtCreate', 'operateTime']),
            result: pickString(item, ['result', 'resultName', 'interviewResult', 'evaluateResult', 'statusName', 'conclusion']),
            summary,
            rawText: JSON.stringify(item),
          };
          const dedupeKey = `${review.stageName}|${review.interviewer}|${review.interviewTime}|${review.result}|${review.summary}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            reviews.push(review);
          }
        }
        visit(item, [...path, String(index)]);
      });
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      visit(value, [...path, key]);
    }
  }

  visit(data, []);
  return reviews;
}

function parseHistoricalInterviewReviewsFromHtml(evHistoryHtml) {
  const html = String(evHistoryHtml || '');
  if (!html.trim()) {
    return [];
  }

  const sectionPattern =
    /<div id="index(\d+)"class="Int-round">([\s\S]*?)<\/div>\s*<div class="hiddenLayer"[^>]*>([\s\S]*?)<\/div>/gi;
  const reviews = [];
  let match;

  while ((match = sectionPattern.exec(html)) !== null) {
    const [, index, headerHtml, bodyHtml] = match;
    const timeMatch = headerHtml.match(/<font>\s*(?:<i[\s\S]*?<\/i>)?\s*([^<]+)\s*<\/font>/i);
    const roundMatch = headerHtml.match(/<span[^>]*class="r-c-g"[^>]*>([\s\S]*?)<\/span>/i);
    const interviewerMatches = [...bodyHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((item) => stripHtml(item[1]))
      .filter(Boolean);
    const summary = stripHtml(bodyHtml);

    if (!summary) {
      continue;
    }

    reviews.push({
      id: `ev-history-${index}`,
      source: 'wintalent',
      stageName: stripHtml(roundMatch?.[1] || '') || undefined,
      interviewer: interviewerMatches.join('；') || undefined,
      interviewTime: stripHtml(timeMatch?.[1] || '') || undefined,
      result: undefined,
      summary,
      rawText: html.slice(match.index, sectionPattern.lastIndex),
    });
  }

  if (reviews.length > 0) {
    return reviews;
  }

  const fallback = stripHtml(html);
  return fallback
    ? [{
        id: 'ev-history-raw',
        source: 'wintalent',
        summary: fallback,
        rawText: html,
      }]
    : [];
}

async function resolveBaseFlow(interviewUrl, lanType = 1) {
  const jar = new CookieJar();

  const entry = await requestWithJar(jar, interviewUrl, { followRedirects: 8 });
  const showResumeUrl = extractShowResumeUrl(entry.history, entry.url);
  const entryText = await entry.res.clone().text().catch(() => '');
  const resumeUnavailableMessage = extractResumeUnavailableMessage(entryText);

  if (!showResumeUrl.includes('/showResume.html')) {
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error('无法定位 showResume 页面，链接可能已失效');
  }

  const createTokenUrl = await resolveCreateTokenEndpoint(jar, showResumeUrl, entry.res);
  if (!createTokenUrl) {
    throw new Error('未拿到 createTokenUrl Cookie，无法继续 token 链路');
  }

  const p = getShowResumeParams(showResumeUrl);
  const currentResumeInfoUrl = await createTokenizedUrl(
    jar,
    createTokenUrl,
    '/interviewPlatform/currentResumeInfo',
    showResumeUrl
  );

  const currentResumeInfo = await postFormJson(
    jar,
    currentResumeInfoUrl,
    {
      operateObjStr: '',
      currentApplyId: p.currentApplyId,
      currentPlanId: '',
      operateToEv: 'false',
      moduleCode: p.moduleCode,
      resumeType: p.resumeType,
      currentIndex: '1',
      fromMessage: p.fromMessage,
      mailOperateId: p.mailOperateId,
      isNewPc: 'true',
      isShowAnalyzeResume: p.isShowAnalyzeResume,
      isShowOriginalResume: p.isShowOriginalResume,
      isHomePage: 'false',
      isSequenceOne: 'false',
      linkDataId: '',
      batchKey: p.batchKey,
      sendToCCBool: p.sendToCCBool,
    },
    showResumeUrl
  );

  const resumeTab0 = currentResumeInfo?.resumeTab?.[0];
  const detailHeadPersInfo = currentResumeInfo?.detailHeadPersInfo || {};
  const applyId = String(resumeTab0?.applyId || p.currentApplyId || '');
  const resumeId = String(resumeTab0?.resumeId || '');
  const postId = String(resumeTab0?.postId || '');
  const recruitType = String(
    detailHeadPersInfo?.recruitType || resumeTab0?.recruitType || currentResumeInfo?.applyInfo?.recruitType || ''
  );
  const detailUrlRaw = currentResumeInfo?.getResumeDetailTypeUrl;

  if (!detailUrlRaw || !applyId || !resumeId || !postId) {
    throw new Error('currentResumeInfo 返回数据不完整，无法继续');
  }

  const getResumeDetailTypeUrl = new URL(detailUrlRaw, ORIGIN).toString();
  const detailType = await postFormJson(
    jar,
    getResumeDetailTypeUrl,
    {
      applyId,
      resumeId,
      postId,
      lanType: String(lanType),
      fromMessage: p.fromMessage,
      isShowAnalyzeResume: p.isShowAnalyzeResume,
      isShowOriginalResume: p.isShowOriginalResume,
      linkDataId: '',
    },
    showResumeUrl
  );

  return {
    jar,
    showResumeUrl,
    createTokenUrl: new URL(createTokenUrl, ORIGIN).toString(),
    currentResumeInfoUrl,
    currentResumeInfo,
    getResumeDetailTypeUrl,
    detailType,
    params: p,
    metadata: {
      applyId,
      resumeId,
      postId,
      planId: String(resumeTab0?.planId || ''),
      recruitType: recruitType || null,
      positionName: detailHeadPersInfo?.positionName || null,
      originalFileId: detailType.originalFileId || null,
      originalFileName: detailType.originalFileName || null,
      encryptId: detailType.encryptId || null,
    },
  };
}

async function resolvePdfFlow(interviewUrl, lanType = 1) {
  const flow = await resolveBaseFlow(interviewUrl, lanType);

  if (!flow.detailType?.resumeOriginalInfoUrl) {
    throw new Error('未拿到 resumeOriginalInfoUrl，可能无原始简历权限');
  }

  const resumeOriginalRaw = appendQueryParam(
    new URL(flow.detailType.resumeOriginalInfoUrl, ORIGIN).toString(),
    'lanType',
    String(lanType)
  );
  const resumeOriginalPath = new URL(resumeOriginalRaw).pathname + new URL(resumeOriginalRaw).search;

  const tokenizedResumeOriginalUrl = await createTokenizedUrl(
    flow.jar,
    flow.createTokenUrl,
    resumeOriginalPath,
    flow.showResumeUrl
  );
  const pdfUrl = appendQueryParam(tokenizedResumeOriginalUrl, 'showPdf', 'true');

  return {
    ...flow,
    tokenizedResumeOriginalUrl,
    pdfUrl,
  };
}

async function resolveJdFromFlow(flow) {
  const postId = String(flow?.metadata?.postId || '');
  const recruitType = String(flow?.metadata?.recruitType || '');
  if (!postId || !recruitType) {
    throw new Error('未拿到 postId/recruitType，无法获取 JD');
  }

  const tokenizedShowPostJdUrl = await createTokenizedUrl(
    flow.jar,
    flow.createTokenUrl,
    '/common/data/showPostJD',
    flow.showResumeUrl
  );

  const jd = await postFormJson(
    flow.jar,
    tokenizedShowPostJdUrl,
    {
      postId,
      recruitType,
    },
    flow.showResumeUrl
  );

  if (jd?.moPermissions) {
    throw new Error('无职位JD权限');
  }

  return {
    jd,
    tokenizedShowPostJdUrl,
  };
}

async function resolveCandidateDataFromFlow(flow) {
  const applyId = String(flow?.metadata?.applyId || '');
  const resumeId = String(flow?.metadata?.resumeId || '');
  const postId = String(flow?.metadata?.postId || '');
  let historicalInterviewReviews = [];

  if (applyId && resumeId && postId) {
    try {
      const tokenizedEvHistoryUrl = await createTokenizedUrl(
        flow.jar,
        flow.createTokenUrl,
        '/interviewPlatform/evHistoryData',
        flow.showResumeUrl
      );

      const evHistoryResult = await postFormJson(
        flow.jar,
        tokenizedEvHistoryUrl,
        {
          applyId,
          resumeId,
          postId,
        },
        flow.showResumeUrl
      );

      if (evHistoryResult?.haveEv && evHistoryResult?.evHistory) {
        historicalInterviewReviews = parseHistoricalInterviewReviewsFromHtml(evHistoryResult.evHistory);
      }
    } catch {
      historicalInterviewReviews = [];
    }
  }

  if (historicalInterviewReviews.length === 0) {
    historicalInterviewReviews = extractHistoricalInterviewReviews(flow.currentResumeInfo);
  }

  return {
    historicalInterviewReviews,
  };
}

function resolveEvaluationContextFromFlow(flow) {
  const operateList = Array.isArray(flow?.currentResumeInfo?.detailHeadPersInfo?.operateList)
    ? flow.currentResumeInfo.detailHeadPersInfo.operateList
    : [];
  const evaluateOperate = operateList.find((item) => String(item?.name || item?.cnName || '').includes('去评价'));
  const evaluationUrl = extractOperationUrlFromJavascript(
    evaluateOperate?.url || evaluateOperate?.tokenUrl || evaluateOperate?.functionUrl
  );

  if (!evaluateOperate || !evaluationUrl) {
    throw new Error('当前候选人没有可用的“去评价”入口');
  }

  const url = new URL(evaluationUrl);
  const query = url.searchParams;
  const interviewType = query.get('interviewType') || '';
  const operateObjStr =
    query.get('operateObjStr') ||
    String(flow?.currentResumeInfo?.resumeTab?.[0]?.operateObjStr || '');
  const planId = Number(query.get('planId') || flow?.metadata?.planId || 0);
  const interviewerId = Number(query.get('interviewerId') || 0);
  const isMain = Number(query.get('isMain') || 0);

  return {
    evaluationUrl,
    evaluationPayload: {
      operateObjStr,
      isMyself: 1,
      isMyInterview: 0,
      interviewTempleteId: '',
      quickEv: 1,
      isMain,
      planId,
      interviewType,
      interviewerId,
    },
  };
}

async function resolveEvaluationFormFromFlow(flow) {
  const evaluationContext = resolveEvaluationContextFromFlow(flow);
  const tokenizedShowUrl = await createTokenizedUrl(
    flow.jar,
    flow.createTokenUrl,
    '/interviewPlatform/candidate/interviewEvaluate/show',
    flow.showResumeUrl
  );
  const response = await postFormJson(
    flow.jar,
    tokenizedShowUrl,
    {
      content: JSON.stringify(evaluationContext.evaluationPayload),
    },
    flow.showResumeUrl
  );

  if (!response || response.state !== 0 || !response.data) {
    throw new Error(response?.msg || '加载 Wintalent 评价表失败');
  }

  return {
    ...evaluationContext,
    tokenizedShowUrl,
    formData: response.data,
  };
}

async function autoSaveEvaluationDraftFromFlow(flow, result) {
  const evaluationForm = await resolveEvaluationFormFromFlow(flow);
  const tokenizedAutoSaveUrl = await createTokenizedUrl(
    flow.jar,
    flow.createTokenUrl,
    '/interviewPlatform/autoSaveEv',
    flow.showResumeUrl
  );
  const payload = buildLegacyEvaluationAutoSavePayload(evaluationForm.formData, evaluationForm, result);
  const responseText = await postFormText(
    flow.jar,
    tokenizedAutoSaveUrl,
    payload,
    flow.showResumeUrl
  );
  if (/系统服务出现异常|操作失败|失败/i.test(responseText || '')) {
    throw new Error(responseText || '自动暂存 Wintalent 评价失败');
  }

  return {
    evaluationUrl: evaluationForm.evaluationUrl,
    candidateLinkUrl: buildCandidateLinkFallbackUrl(flow.showResumeUrl),
    tokenizedAutoSaveUrl,
    payload,
    responseText,
  };
}

async function streamPdfFromFlow(flow) {
  const { res } = await requestWithJar(flow.jar, flow.pdfUrl, {
    method: 'GET',
    referer: flow.showResumeUrl,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text();
    const resumeUnavailableMessage = extractResumeUnavailableMessage(text);
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error(`拉取 PDF 失败: HTTP ${res.status}, ${text.slice(0, 200)}`);
  }

  if (!contentType.toLowerCase().includes('pdf')) {
    const text = await res.text();
    const resumeUnavailableMessage = extractResumeUnavailableMessage(text);
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    throw new Error(`拉取 PDF 失败: 返回内容类型异常 ${contentType || '未知'}，${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: contentType || 'application/pdf',
    contentDisposition: res.headers.get('content-disposition') || 'inline; filename="resume.pdf"',
  };
}

async function resolveResumeTextFromFlow(flow) {
  const applyId = String(flow?.metadata?.applyId || '');
  const resumeId = String(flow?.metadata?.resumeId || '');
  if (!applyId || !resumeId) {
    throw new Error('未拿到 applyId/resumeId，无法获取标准简历');
  }

  const tokenizedResumeDetailInfoUrl = await createTokenizedUrl(
    flow.jar,
    flow.createTokenUrl,
    '/interviewPlatform/resumeDetailInfo',
    flow.showResumeUrl
  );

  const payload = await postFormJson(
    flow.jar,
    tokenizedResumeDetailInfoUrl,
    {
      applyId,
      resumeId,
      resumeType: '1',
      isFromMessage: flow.params?.fromMessage || 'false',
      lanType: '1',
    },
    flow.showResumeUrl
  );

  const text = extractResumeTextFromResumeDetailHtml(payload?.resumeDetailInfo || '');
  if (!text) {
    throw new Error('标准简历页面没有可提取的正文内容');
  }

  return {
    text,
    title: 'Wintalent 标准简历',
    resumeId,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const path = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, JSON_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'GET' && path === '/healthz') {
    sendJson(res, 200, { ok: true, service: 'wintalent-proxy' });
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/resolve') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const lanType = Number(body.lanType || 1);
      if (!interviewUrl.startsWith('http')) {
      sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }

      const flow = await resolvePdfFlow(interviewUrl, lanType);
      sendJson(res, 200, {
        ok: true,
        pdfUrl: flow.pdfUrl,
        metadata: flow.metadata,
        debug: {
          showResumeUrl: flow.showResumeUrl,
          currentResumeInfoUrl: flow.currentResumeInfoUrl,
          getResumeDetailTypeUrl: flow.getResumeDetailTypeUrl,
          tokenizedResumeOriginalUrl: flow.tokenizedResumeOriginalUrl,
        },
      });
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/download') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const lanType = Number(body.lanType || 1);
      if (!interviewUrl.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }

      const flow = await resolvePdfFlow(interviewUrl, lanType);
      const file = await streamPdfFromFlow(flow);

      res.writeHead(200, {
        'Content-Type': file.contentType,
        'Content-Disposition': file.contentDisposition,
        'Content-Length': String(file.buffer.length),
        'Access-Control-Allow-Origin': '*',
        'X-Wintalent-Pdf-Url': flow.pdfUrl,
        'X-Wintalent-Resume-Id': flow.metadata.resumeId,
      });
      res.end(file.buffer);
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/jd') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const lanType = Number(body.lanType || 1);
      if (!interviewUrl.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }

      const flow = await resolveBaseFlow(interviewUrl, lanType);
      const jdResult = await resolveJdFromFlow(flow);

      sendJson(res, 200, {
        ok: true,
        jd: jdResult.jd,
        metadata: flow.metadata,
        debug: {
          showResumeUrl: flow.showResumeUrl,
          currentResumeInfoUrl: flow.currentResumeInfoUrl,
          tokenizedShowPostJdUrl: jdResult.tokenizedShowPostJdUrl,
        },
      });
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/candidate') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const lanType = Number(body.lanType || 1);
      if (!interviewUrl.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }

      const flow = await resolveBaseFlow(interviewUrl, lanType);
      const candidateData = resolveCandidateDataFromFlow(flow);

      sendJson(res, 200, {
        ok: true,
        historicalInterviewReviews: candidateData.historicalInterviewReviews,
        metadata: flow.metadata,
      });
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/resume-text') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const lanType = Number(body.lanType || 1);
      if (!interviewUrl.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }

      const flow = await resolveBaseFlow(interviewUrl, lanType);
      const resumeText = await resolveResumeTextFromFlow(flow);

      sendJson(res, 200, {
        ok: true,
        text: resumeText.text,
        title: resumeText.title,
        source: 'html',
        resumeId: resumeText.resumeId,
        metadata: flow.metadata,
      });
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/wintalent/evaluation-autofill') {
    try {
      const body = await readJsonBody(req);
      const interviewUrl = String(body.interviewUrl || '');
      const result = body.result;
      const lanType = Number(body.lanType || 1);

      if (!interviewUrl.startsWith('http')) {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'interviewUrl is required' });
        return;
      }
      if (!result || typeof result !== 'object') {
        sendJson(res, 400, { ok: false, code: ERROR_CODES.BAD_REQUEST, error: 'result is required' });
        return;
      }

      const flow = await resolveBaseFlow(interviewUrl, lanType);
      const draft = await autoSaveEvaluationDraftFromFlow(flow, result);

      sendJson(res, 200, {
        ok: true,
        evaluationUrl: draft.evaluationUrl,
        candidateLinkUrl: draft.candidateLinkUrl,
        metadata: flow.metadata,
        debug: {
          showResumeUrl: flow.showResumeUrl,
          tokenizedAutoSaveUrl: draft.tokenizedAutoSaveUrl,
          payloadPreview: {
            planId: draft.payload.planId,
            interviewResult: draft.payload.interviewResult,
            evaluationInfoCount: String(draft.payload.evInfoStr || '')
              .split(';;')
              .filter(Boolean).length,
          },
        },
      });
    } catch (error) {
      sendProxyError(res, error);
    }
    return;
  }

  sendJson(res, 404, { ok: false, code: ERROR_CODES.NOT_FOUND, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[wintalent-proxy] listening on http://${HOST}:${PORT}`);
  console.log('[wintalent-proxy] endpoints:');
  console.log('  GET  /healthz');
  console.log('  POST /api/wintalent/resolve');
  console.log('  POST /api/wintalent/download');
  console.log('  POST /api/wintalent/jd');
  console.log('  POST /api/wintalent/candidate');
  console.log('  POST /api/wintalent/resume-text');
  console.log('  POST /api/wintalent/evaluation-autofill');
});
