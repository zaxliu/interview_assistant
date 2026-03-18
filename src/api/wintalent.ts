const WINTALENT_DOWNLOAD_API = '/api/wintalent/download';
const WINTALENT_JD_API = '/api/wintalent/jd';
const WINTALENT_CANDIDATE_API = '/api/wintalent/candidate';
const WINTALENT_PROXY_OFFLINE_MESSAGE =
  'Wintalent 代理服务不可用，请先运行 `npm run proxy:wintalent`（或直接使用 `npm run dev` / `npm start`）。';
const WINTALENT_RESUME_UNAVAILABLE_MESSAGE =
  '当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!';
const WINTALENT_RESUME_UNAVAILABLE_KEYWORD = '当前简历已流转到其他环节或已被删除';

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
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) {
      const nestedResumeUnavailableMessage = extractResumeUnavailableMessage(json.error);
      if (nestedResumeUnavailableMessage) {
        return nestedResumeUnavailableMessage;
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
