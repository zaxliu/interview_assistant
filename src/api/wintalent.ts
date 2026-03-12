const WINTALENT_DOWNLOAD_API = '/api/wintalent/download';

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
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // noop
  }
  return text.slice(0, 300);
};

export interface WintalentDownloadResult {
  blob: Blob;
  filename: string;
  resolvedPdfUrl: string | null;
  resumeId: string | null;
}

export const downloadWintalentResumePDF = async (interviewUrl: string): Promise<WintalentDownloadResult> => {
  const normalized = interviewUrl.trim();
  if (!normalized) {
    throw new Error('请输入 Wintalent 面试链接');
  }

  const response = await fetch(WINTALENT_DOWNLOAD_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ interviewUrl: normalized }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('pdf')) {
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
