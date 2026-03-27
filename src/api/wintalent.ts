const WINTALENT_DOWNLOAD_API = '/api/wintalent/download';
const WINTALENT_JD_API = '/api/wintalent/jd';
const WINTALENT_CANDIDATE_API = '/api/wintalent/candidate';
const WINTALENT_RESUME_TEXT_API = '/api/wintalent/resume-text';
const WINTALENT_EVALUATION_AUTOFILL_API = '/api/wintalent/evaluation-autofill';
const WINTALENT_PROXY_OFFLINE_MESSAGE =
  'Wintalent 代理服务不可用，请先运行 `npm run proxy:wintalent`（或直接使用 `npm run dev` / `npm start`）。';
const WINTALENT_RESUME_UNAVAILABLE_MESSAGE =
  '当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!';
const WINTALENT_RESUME_UNAVAILABLE_KEYWORD = '当前简历已流转到其他环节或已被删除';
const WINTALENT_NO_ORIGINAL_RESUME_PERMISSION_MESSAGE =
  '当前链接没有原始简历查看权限，暂时无法一键导入，请在 Wintalent 中确认该候选人是否支持查看原始简历。';
const WINTALENT_LINK_EXPIRED_MESSAGE = 'Wintalent 链接可能已失效，请重新进入面试链接后再试。';
const WINTALENT_AUTH_REQUIRED_MESSAGE = 'Wintalent 授权状态已失效，请重新打开新的面试链接后再试。';

type WintalentErrorCode =
  | 'BAD_REQUEST'
  | 'LINK_EXPIRED'
  | 'RESUME_UNAVAILABLE'
  | 'NO_ORIGINAL_RESUME_PERMISSION'
  | 'JD_PERMISSION_DENIED'
  | 'AUTH_REQUIRED'
  | 'PDF_FLOW_DATA_INCOMPLETE'
  | 'PDF_FETCH_FAILED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

const mapWintalentErrorCode = (code: WintalentErrorCode | string | undefined): string | null => {
  switch (code) {
    case 'RESUME_UNAVAILABLE':
      return WINTALENT_RESUME_UNAVAILABLE_MESSAGE;
    case 'NO_ORIGINAL_RESUME_PERMISSION':
      return WINTALENT_NO_ORIGINAL_RESUME_PERMISSION_MESSAGE;
    case 'LINK_EXPIRED':
      return WINTALENT_LINK_EXPIRED_MESSAGE;
    case 'AUTH_REQUIRED':
      return WINTALENT_AUTH_REQUIRED_MESSAGE;
    default:
      return null;
  }
};

const extractNoOriginalResumePermissionMessage = (text: string): string | null => {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, '');
  if (normalized.includes('未拿到resumeOriginalInfoUrl')) {
    return WINTALENT_NO_ORIGINAL_RESUME_PERMISSION_MESSAGE;
  }
  if (normalized.includes('无原始简历权限')) {
    return WINTALENT_NO_ORIGINAL_RESUME_PERMISSION_MESSAGE;
  }
  return null;
};

const extractResumeUnavailableMessage = (text: string): string | null => {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, '');
  if (normalized.includes(WINTALENT_RESUME_UNAVAILABLE_MESSAGE.replace(/\s+/g, ''))) {
    return WINTALENT_RESUME_UNAVAILABLE_MESSAGE;
  }
  if (normalized.includes(WINTALENT_RESUME_UNAVAILABLE_KEYWORD.replace(/\s+/g, ''))) {
    return WINTALENT_RESUME_UNAVAILABLE_MESSAGE;
  }
  return null;
};

const decodeRfc5987 = (value: string): string => {
  const cleaned = value.trim().replace(/^UTF-8''/i, '');
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
};

const parseFilenameFromContentDisposition = (contentDisposition: string | null): string | null => {
  if (!contentDisposition) return null;

  const starMatch = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i);
  if (starMatch?.[1]) {
    const decoded = decodeRfc5987(starMatch[1].replace(/^["']|["']$/g, ''));
    if (decoded) return decoded;
  }

  const basicMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  if (basicMatch?.[1]) {
    const raw = basicMatch[1].trim().replace(/^["']|["']$/g, '');
    if (raw) return raw;
  }

  return null;
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) return `请求失败：HTTP ${response.status}`;
  const resumeUnavailableMessage = extractResumeUnavailableMessage(text);
  if (resumeUnavailableMessage) {
    return resumeUnavailableMessage;
  }
  const noOriginalResumePermissionMessage = extractNoOriginalResumePermissionMessage(text);
  if (noOriginalResumePermissionMessage) {
    return noOriginalResumePermissionMessage;
  }
  try {
    const json = JSON.parse(text) as { error?: string; code?: WintalentErrorCode | string };
    const codeMessage = mapWintalentErrorCode(json.code);
    if (codeMessage) {
      return codeMessage;
    }
    if (json.error) {
      const nestedResumeUnavailableMessage = extractResumeUnavailableMessage(json.error);
      if (nestedResumeUnavailableMessage) {
        return nestedResumeUnavailableMessage;
      }
      const nestedNoOriginalResumePermissionMessage = extractNoOriginalResumePermissionMessage(json.error);
      if (nestedNoOriginalResumePermissionMessage) {
        return nestedNoOriginalResumePermissionMessage;
      }
      if (isWintalentProxyUnavailableMessage(json.error)) {
        return WINTALENT_PROXY_OFFLINE_MESSAGE;
      }
      return json.error;
    }
  } catch {
    // noop
  }
  if (isWintalentProxyUnavailableMessage(text)) {
    return WINTALENT_PROXY_OFFLINE_MESSAGE;
  }
  return text.slice(0, 300);
};

const isWintalentProxyUnavailableMessage = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('econnrefused') ||
    normalized.includes('connect refused') ||
    normalized.includes('failed to proxy') ||
    normalized.includes('127.0.0.1:8787') ||
    normalized.includes('::1:8787')
  );
};

const toNetworkErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const resumeUnavailableMessage = extractResumeUnavailableMessage(message);
  if (resumeUnavailableMessage) {
    return resumeUnavailableMessage;
  }
  const noOriginalResumePermissionMessage = extractNoOriginalResumePermissionMessage(message);
  if (noOriginalResumePermissionMessage) {
    return noOriginalResumePermissionMessage;
  }
  if (isWintalentProxyUnavailableMessage(message) || message.toLowerCase().includes('failed to fetch')) {
    return WINTALENT_PROXY_OFFLINE_MESSAGE;
  }
  return message || '请求失败，请稍后重试';
};

export interface WintalentDownloadResult {
  blob: Blob;
  filename: string;
  resolvedPdfUrl: string | null;
  resumeId: string | null;
}

export interface WintalentHistoricalInterviewReview {
  id: string;
  source?: 'wintalent';
  stageName?: string;
  interviewer?: string;
  interviewTime?: string;
  result?: string;
  summary: string;
  rawText?: string;
}

export interface WintalentJDData {
  postName?: string;
  workContent?: string;
  serviceCondition?: string;
  education?: string;
  workPlaceName?: string;
  postTypeName?: string;
  recruitNum?: string;
}

export interface WintalentCandidateData {
  historicalInterviewReviews: WintalentHistoricalInterviewReview[];
}

export interface WintalentResumeTextData {
  text: string;
  resumeId: string | null;
  source: 'html';
  title?: string;
}

export interface WintalentEvaluationAutofillResultPayload {
  interview_info: {
    interviewer: string;
    overall_result: '通过' | '不通过' | '待定';
    interview_time: string;
  };
  evaluation_dimensions: Array<{
    dimension: string;
    score: number;
    assessment_points: string;
  }>;
  summary: {
    suggested_level: string;
    comprehensive_score: number;
    overall_comment: string;
    interview_conclusion: '通过' | '不通过' | '待定';
    is_strongly_recommended: boolean;
  };
  additional_info?: {
    strengths?: string[];
    concerns?: string[];
    follow_up_questions?: string[];
  };
}

export interface WintalentEvaluationAutofillResult {
  evaluationUrl: string;
  candidateLinkUrl: string | null;
}

export interface WintalentJDResolution {
  link: string;
  jd: WintalentJDData;
}

const normalizeJdText = (value: string | undefined): string => {
  return (value || '').replace(/&br&/g, '\n').replace(/\r\n/g, '\n').trim();
};

export const buildPositionDescriptionFromWintalentJD = (jd: WintalentJDData): string => {
  const lines: string[] = [];
  const workContent = normalizeJdText(jd.workContent);
  const serviceCondition = normalizeJdText(jd.serviceCondition);

  if (jd.postName) lines.push(`岗位：${jd.postName}`);
  if (jd.workPlaceName) lines.push(`工作地点：${jd.workPlaceName}`);
  if (jd.education) lines.push(`学历要求：${jd.education}`);
  if (jd.postTypeName) lines.push(`岗位类别：${jd.postTypeName}`);
  if (jd.recruitNum) lines.push(`招聘人数：${jd.recruitNum}`);

  if (workContent) {
    if (lines.length > 0) lines.push('');
    lines.push('工作职责：');
    lines.push(workContent);
  }

  if (serviceCondition) {
    if (lines.length > 0) lines.push('');
    lines.push('任职要求：');
    lines.push(serviceCondition);
  }

  return lines.join('\n').trim();
};

export const isWintalentInterviewLink = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('wintalent.cn');
  } catch {
    return false;
  }
};

export const downloadWintalentResumePDF = async (interviewUrl: string): Promise<WintalentDownloadResult> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  let response: Response;
  try {
    response = await fetch(WINTALENT_DOWNLOAD_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interviewUrl: normalized }),
    });
  } catch (error) {
    throw new Error(toNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('pdf')) {
    const nonPdfText = await blob.text().catch(() => '');
    const resumeUnavailableMessage = extractResumeUnavailableMessage(nonPdfText);
    if (resumeUnavailableMessage) {
      throw new Error(resumeUnavailableMessage);
    }
    const noOriginalResumePermissionMessage = extractNoOriginalResumePermissionMessage(nonPdfText);
    if (noOriginalResumePermissionMessage) {
      throw new Error(noOriginalResumePermissionMessage);
    }
    throw new Error(`返回内容类型异常：${contentType || '未知'}`);
  }

  const filename =
    parseFilenameFromContentDisposition(response.headers.get('content-disposition')) || 'wintalent_resume.pdf';

  return {
    blob,
    filename,
    resolvedPdfUrl: response.headers.get('x-wintalent-pdf-url'),
    resumeId: response.headers.get('x-wintalent-resume-id'),
  };
};

export const fetchWintalentPositionJD = async (interviewUrl: string): Promise<WintalentJDData> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  let response: Response;
  try {
    response = await fetch(WINTALENT_JD_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interviewUrl: normalized }),
    });
  } catch (error) {
    throw new Error(toNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as { ok?: boolean; error?: string; jd?: WintalentJDData };
  if (!payload?.ok || !payload.jd) {
    throw new Error(payload?.error || '获取岗位 JD 失败');
  }
  return payload.jd;
};

export const fetchFirstAvailableWintalentPositionJD = async (
  interviewUrls: string[]
): Promise<WintalentJDResolution> => {
  const links = Array.from(
    new Set(
      interviewUrls
        .map((value) => value.trim())
        .filter((value) => isWintalentInterviewLink(value))
    )
  );

  if (links.length === 0) {
    throw new Error('当前岗位下未找到 Wintalent 候选人链接。');
  }

  let lastError: unknown = null;
  for (const link of links) {
    try {
      const jd = await fetchWintalentPositionJD(link);
      return { link, jd };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('获取岗位 JD 失败');
};

export const fetchWintalentCandidateData = async (interviewUrl: string): Promise<WintalentCandidateData> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  let response: Response;
  try {
    response = await fetch(WINTALENT_CANDIDATE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interviewUrl: normalized }),
    });
  } catch (error) {
    throw new Error(toNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    historicalInterviewReviews?: WintalentHistoricalInterviewReview[];
  };
  if (!payload?.ok) {
    throw new Error(payload?.error || '获取候选人历史面评失败');
  }

  return {
    historicalInterviewReviews: Array.isArray(payload.historicalInterviewReviews)
      ? payload.historicalInterviewReviews
      : [],
  };
};

export const fetchWintalentResumeText = async (interviewUrl: string): Promise<WintalentResumeTextData> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  let response: Response;
  try {
    response = await fetch(WINTALENT_RESUME_TEXT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interviewUrl: normalized }),
    });
  } catch (error) {
    throw new Error(toNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    text?: string;
    resumeId?: string | null;
    source?: 'html';
    title?: string;
  };
  if (!payload?.ok || !payload.text?.trim()) {
    throw new Error(payload?.error || '获取标准简历文本失败');
  }

  return {
    text: payload.text,
    resumeId: payload.resumeId ?? null,
    source: payload.source || 'html',
    title: payload.title,
  };
};

export const autofillWintalentEvaluationDraft = async (
  interviewUrl: string,
  result: WintalentEvaluationAutofillResultPayload
): Promise<WintalentEvaluationAutofillResult> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  let response: Response;
  try {
    response = await fetch(WINTALENT_EVALUATION_AUTOFILL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interviewUrl: normalized, result }),
    });
  } catch (error) {
    throw new Error(toNetworkErrorMessage(error));
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    evaluationUrl?: string;
    candidateLinkUrl?: string | null;
  };
  if (!payload?.ok || !payload.evaluationUrl) {
    throw new Error(payload?.error || '回填 Wintalent 评价草稿失败');
  }

  return {
    evaluationUrl: payload.evaluationUrl,
    candidateLinkUrl: payload.candidateLinkUrl ?? null,
  };
};
