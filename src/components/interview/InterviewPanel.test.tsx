import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPanel } from './InterviewPanel';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import type { Candidate, MemoryRefreshScope, Position } from '@/types';

const {
  ensureGenerationMemoryFreshMock,
  extractInterviewNotesInsightsMock,
  getFeishuDocRawContentFromLinkMock,
  generateInterviewQuestionsMock,
  getPDFMock,
} = vi.hoisted(() => ({
  ensureGenerationMemoryFreshMock: vi.fn(),
  extractInterviewNotesInsightsMock: vi.fn(),
  getFeishuDocRawContentFromLinkMock: vi.fn(),
  generateInterviewQuestionsMock: vi.fn(),
  getPDFMock: vi.fn(async () => ({
    data: new ArrayBuffer(8),
    filename: 'resume.pdf',
  })),
}));

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    ensureGenerationMemoryFresh: ensureGenerationMemoryFreshMock,
    generateInterviewQuestions: generateInterviewQuestionsMock,
    extractInterviewNotesInsights: extractInterviewNotesInsightsMock,
  }),
}));

vi.mock('@/api/feishu', () => ({
  getFeishuDocRawContentFromLink: getFeishuDocRawContentFromLinkMock,
}));

vi.mock('@/utils/pdfStorage', () => ({
  getPDF: getPDFMock,
}));

vi.mock('@/components/ui/PDFViewer', () => ({
  PDFViewer: () => <div data-testid="pdf-viewer">PDF Viewer</div>,
}));

const buildCandidate = (): Candidate => ({
  id: 'candidate-1',
  name: 'Alice',
  status: 'scheduled',
  questions: [],
  resumeText: 'Experienced engineer',
  resumeHighlights: {
    summary: '候选人亮点摘要',
    strengths: ['系统设计'],
    risks: [],
    experience: [],
    keywords: [],
  },
});

const buildPosition = (candidate: Candidate): Position => ({
  id: 'position-1',
  title: 'Staff Engineer',
  criteria: [],
  createdAt: '2026-03-18T00:00:00.000Z',
  source: 'manual',
  candidates: [candidate],
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('InterviewPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    extractInterviewNotesInsightsMock.mockReset();
    ensureGenerationMemoryFreshMock.mockReset();
    generateInterviewQuestionsMock.mockReset();
    getFeishuDocRawContentFromLinkMock.mockReset();
    getPDFMock.mockReset();
    getPDFMock.mockResolvedValue({
      data: new ArrayBuffer(8),
      filename: 'resume.pdf',
    });
    usePositionStore.setState({
      positions: [],
      currentUserId: null,
    });
    useSettingsStore.setState({
      aiApiKey: '',
      aiModel: 'gpt-4',
      feishuAppId: '',
      feishuAppSecret: '',
      feishuUserAccessToken: '',
      feishuRefreshToken: '',
      feishuUser: null,
      interviewSplitRatio: 0.5,
    });
    useInterviewUIStore.getState().reset();
  });

  it('closes the snapshot panel when clicking outside of it', async () => {
    const candidate = buildCandidate();
    const position = buildPosition(candidate);

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    const toggleButton = await screen.findByRole('button', { name: /候选人快照/i });
    fireEvent.click(toggleButton);

    expect(await screen.findByText('候选人亮点摘要')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('候选人亮点摘要')).not.toBeInTheDocument();
    });
  });

  it('shows Wintalent HTML resume text instead of PDF when resumeViewerMode is html', async () => {
    const candidate = buildCandidate();
    candidate.resumeViewerMode = 'html';
    candidate.resumeRawText = '自我评价\n工作经历';
    const position = buildPosition(candidate);

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    expect(await screen.findByText('当前候选人没有原始 PDF 简历，正在展示 Wintalent 标准简历文本。')).toBeInTheDocument();
    expect(screen.getByText('简历文本')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '自我评价\n工作经历')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('creates a new question when meeting notes reveal an uncovered angle', async () => {
    const candidate = buildCandidate();
    candidate.questions = [
      {
        id: 'q-1',
        text: '如何保障训练稳定性？',
        source: 'common',
        evaluationDimension: '专业能力',
        isAIGenerated: true,
        status: 'not_reached',
      },
    ];
    const position = buildPosition(candidate);

    usePositionStore.setState({
      positions: [position],
      currentUserId: null,
    });

    getFeishuDocRawContentFromLinkMock.mockResolvedValue({
      documentId: 'doc-1',
      title: '面试纪要',
      content: '候选人补充了故障节点隔离和迁移任务的做法。\n\n【原始面试 Transcript：doc-2】\n这是完整逐字稿。',
      transcriptDocumentId: 'doc-2',
      transcriptTitle: '【面试】张晏梓-AI Agent应用工程师 2026年3月18日',
      transcriptContent: '这是完整逐字稿。',
    });
    extractInterviewNotesInsightsMock.mockResolvedValue({
      data: {
        matchedAnswers: [],
        newQAs: [
          {
            question: '如何做故障节点隔离？',
            answer: '打污点并迁移任务。',
            source: 'coding',
            evaluationDimension: '专业能力',
          },
        ],
      },
      usage: { input: 25, cached: 5, output: 12 },
    });

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    fireEvent.change(
      screen.getByPlaceholderText(/请在飞书会议期间开启纪要功能/),
      { target: { value: 'https://example.feishu.cn/docx/abc123' } }
    );
    fireEvent.click(screen.getByRole('button', { name: '从纪要提取问答' }));

    await waitFor(() => {
      const storedCandidate = usePositionStore.getState().positions[0]?.candidates[0];
      expect(storedCandidate?.questions).toHaveLength(2);
      expect(storedCandidate?.meetingNotesContext).toContain('这是完整逐字稿。');
      expect(storedCandidate?.questions[1]).toMatchObject({
        text: '如何做故障节点隔离？',
        source: 'coding',
        evaluationDimension: '专业能力',
        status: 'asked',
        notes: '[来自会议纪要导入] 打污点并迁移任务。',
      });
    });

    expect(extractInterviewNotesInsightsMock).toHaveBeenCalledWith(
      candidate.questions,
      '候选人补充了故障节点隔离和迁移任务的做法。\n\n【原始面试 Transcript：doc-2】\n这是完整逐字稿。'
    );
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('AI 纪要提取 Token') || false).length
    ).toBeGreaterThan(0);
    expect(getFeishuDocRawContentFromLinkMock).toHaveBeenCalledWith(
      'https://example.feishu.cn/docx/abc123',
      undefined,
      undefined,
      undefined
    );
  });

  it('shows a visible memory refresh step and separate token usage before question generation', async () => {
    const candidate = buildCandidate();
    const position = {
      ...buildPosition(candidate),
      description: 'Build platform infrastructure',
      generationMemory: {
        questionMemoryItems: [],
        summaryMemoryItems: [],
        questionGuidancePrompt: '优先追问架构取舍',
        summaryGuidancePrompt: '',
        updatedAt: '2026-04-06T09:00:00.000Z',
        sampleSize: 3,
        version: 1,
      },
    };

    const refreshDeferred = createDeferred<{
      refreshed: boolean;
      usage: { input: number; cached: number; output: number };
    }>();
    ensureGenerationMemoryFreshMock.mockReturnValue(refreshDeferred.promise);
    generateInterviewQuestionsMock.mockResolvedValue({
      data: [],
      usage: { input: 28, cached: 4, output: 16 },
    });

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: '生成面试问题' }));

    expect(screen.getByText('正在更新岗位问题记忆...')).toBeInTheDocument();
    expect(generateInterviewQuestionsMock).not.toHaveBeenCalled();

    refreshDeferred.resolve({
      refreshed: true,
      usage: { input: 17, cached: 2, output: 7 },
    });

    await waitFor(() => {
      expect(ensureGenerationMemoryFreshMock).toHaveBeenCalledWith('position-1', 'question_generation');
      expect(generateInterviewQuestionsMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('正在更新岗位问题记忆...')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/问题记忆更新 Token/)).toBeInTheDocument();
    expect(screen.getByText(/AI 问题生成 Token/)).toBeInTheDocument();
  });

  it('shows refresh failure and does not inject fallback guidance for a new position', async () => {
    const candidate = buildCandidate();
    const position = {
      ...buildPosition(candidate),
      description: 'Build platform infrastructure',
    };

    ensureGenerationMemoryFreshMock.mockResolvedValue({
      refreshed: false,
      error: '未配置 AI API Key',
    });
    generateInterviewQuestionsMock.mockResolvedValue({
      data: [],
      usage: { input: 20, cached: 0, output: 10 },
    });

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: '生成面试问题' }));

    await waitFor(() => {
      expect(generateInterviewQuestionsMock).toHaveBeenCalled();
    });

    expect(screen.getByText('岗位问题记忆刷新失败：未配置 AI API Key，继续使用当前指引。')).toBeInTheDocument();
    expect(generateInterviewQuestionsMock.mock.calls[0][4]).toBeUndefined();
  });

  it('shows pending question memory event counts near the header when question memory is dirty', async () => {
    const candidate = buildCandidate();
    const dirtyScopes: MemoryRefreshScope[] = ['question_generation'];
    const position = {
      ...buildPosition(candidate),
      generationMemoryState: {
        dirtyScopes,
        pendingQuestionEventCount: 4,
        pendingSummaryEventCount: 0,
        pendingQuestionCandidateCount: 2,
        pendingSummaryCandidateCount: 0,
      },
    };

    render(
      <MemoryRouter>
        <InterviewPanel position={position} candidate={candidate} />
      </MemoryRouter>
    );

    expect(screen.getByText(/待合并事件 4，候选人 2/)).toBeInTheDocument();
  });
});
