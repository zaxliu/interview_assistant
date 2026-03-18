import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CandidateForm } from './CandidateForm';
import { usePositionStore } from '@/store/positionStore';

const parseFromFile = vi.fn();
const parseFromUrl = vi.fn();
const processResume = vi.fn();
const { downloadWintalentResumePDF, fetchWintalentCandidateData } = vi.hoisted(() => ({
  downloadWintalentResumePDF: vi.fn(),
  fetchWintalentCandidateData: vi.fn(),
}));

vi.mock('@/hooks/usePDFParser', () => ({
  usePDFParser: () => ({
    isLoading: false,
    error: null,
    progress: null,
    parseFromFile,
    parseFromUrl,
    canUseAI: true,
  }),
}));

vi.mock('@/hooks/useResumeProcessor', () => ({
  useResumeProcessor: () => ({
    isProcessing: false,
    error: null,
    processResume,
  }),
}));

vi.mock('@/utils/pdfStorage', () => ({
  storePDF: vi.fn(),
}));

vi.mock('@/api/pdf', () => ({
  debugDownloadPDFPageAsImage: vi.fn(),
}));

vi.mock('@/api/wintalent', () => ({
  downloadWintalentResumePDF,
  fetchWintalentCandidateData,
}));

describe('CandidateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWintalentCandidateData.mockResolvedValue({ historicalInterviewReviews: [] });
    processResume.mockResolvedValue({
      markdown: 'Normalized resume',
      highlights: {
        summary: '',
        strengths: [],
        risks: [],
        experience: [],
        keywords: [],
      },
      usage: { input: 11, cached: 3, output: 7 },
    });
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('creates a candidate with manual resume text', async () => {
    const onSave = vi.fn();

    render(<CandidateForm positionId="position-1" onSave={onSave} onCancel={() => undefined} />);

    fireEvent.change(screen.getByLabelText('候选人姓名'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('上传 PDF 后将在此显示简历内容，也可手动粘贴...'), {
      target: { value: 'Candidate resume summary' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新增候选人并进入面试' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const savedCandidateId = onSave.mock.calls[0][0];
    expect(savedCandidateId).toBeTruthy();
  });

  it('parses a resume URL when requested', async () => {
    parseFromUrl.mockResolvedValue({ text: 'Parsed resume', usage: { input: 23, cached: 4, output: 15 } });

    render(<CandidateForm positionId="position-1" onSave={() => undefined} onCancel={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText('或粘贴 PDF 直链（非 Wintalent 页面）'), {
      target: { value: 'https://example.com/resume.pdf' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));

    await waitFor(() => {
      expect(parseFromUrl).toHaveBeenCalledWith(
        'https://example.com/resume.pdf',
        true,
        { maxPages: 5 }
      );
      expect(processResume).toHaveBeenCalledWith('Parsed resume');
      expect(screen.getByText(/AI OCR Token/)).toBeInTheDocument();
    });
  });

  it('alerts user and skips resume processing when resume URL content fetch fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    parseFromUrl.mockResolvedValue({ text: '' });

    render(<CandidateForm positionId="position-1" onSave={() => undefined} onCancel={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText('或粘贴 PDF 直链（非 Wintalent 页面）'), {
      target: { value: 'https://example.com/broken.pdf' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析' }));

    await waitFor(() => {
      expect(parseFromUrl).toHaveBeenCalledWith(
        'https://example.com/broken.pdf',
        true,
        { maxPages: 5 }
      );
      expect(alertSpy).toHaveBeenCalledWith('简历链接内容获取失败，请检查链接是否可访问且为 PDF 直链。');
      expect(processResume).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('shows calendar links when they exist on the candidate', () => {
    render(
      <CandidateForm
        positionId="position-1"
        candidate={{
          id: 'candidate-1',
          name: 'Alice',
          status: 'scheduled',
          questions: [],
          interviewLink: 'https://vc.feishu.cn/j/681359281',
          candidateLink: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc',
        }}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('日历链接')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://vc.feishu.cn/j/681359281' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc' })).toBeInTheDocument();
  });

  it('shows resume-unavailable hint when Wintalent link is expired', async () => {
    downloadWintalentResumePDF.mockRejectedValue(
      new Error('当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!')
    );

    render(<CandidateForm positionId="position-1" onSave={() => undefined} onCancel={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText('粘贴 Wintalent 面试链接，一键导入'), {
      target: { value: 'https://www.wintalent.cn/wt/Horizon/kurl?k=expired' },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    await waitFor(() => {
      expect(
        screen.getByText('当前简历已流转到其他环节或已被删除，不能查看，已经帮您自动过滤!')
      ).toBeInTheDocument();
    });
  });

  it('imports Wintalent resume and parses as PDF file', async () => {
    downloadWintalentResumePDF.mockResolvedValue({
      blob: new Blob(['%PDF-1.7 fake'], { type: 'application/pdf' }),
      filename: 'candidate.pdf',
      resolvedPdfUrl: 'https://www.wintalent.cn/interviewer/interviewPlatform/getResumeOriginalInfo?...',
      resumeId: '3293935',
    });
    fetchWintalentCandidateData.mockResolvedValue({
      historicalInterviewReviews: [
        {
          id: 'review-1',
          stageName: '一面',
          result: '通过',
          summary: '有过系统设计考察，结果较好。',
        },
      ],
    });
    parseFromFile.mockResolvedValue({
      text: 'Imported resume text',
      usage: { input: 31, cached: 6, output: 18 },
    });

    render(<CandidateForm positionId="position-1" onSave={() => undefined} onCancel={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText('粘贴 Wintalent 面试链接，一键导入'), {
      target: { value: 'https://www.wintalent.cn/wt/Horizon/kurl?k=abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    await waitFor(() => {
      expect(downloadWintalentResumePDF).toHaveBeenCalledWith(
        'https://www.wintalent.cn/wt/Horizon/kurl?k=abc'
      );
      expect(fetchWintalentCandidateData).toHaveBeenCalledWith(
        'https://www.wintalent.cn/wt/Horizon/kurl?k=abc'
      );
      expect(parseFromFile).toHaveBeenCalledTimes(1);
      expect(processResume).toHaveBeenCalledWith('Imported resume text');
      expect(screen.getByText(/candidate\.pdf/)).toBeInTheDocument();
      expect(screen.getByText('有过系统设计考察，结果较好。')).toBeInTheDocument();
      expect(screen.getByText(/AI OCR Token/)).toBeInTheDocument();
      expect(screen.getByText(/AI 简历整理 Token/)).toBeInTheDocument();
    });
  });
});
