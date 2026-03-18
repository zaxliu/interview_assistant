import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPanel } from './InterviewPanel';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import type { Candidate, Position } from '@/types';

const {
  extractInterviewNotesInsightsMock,
  getFeishuDocRawContentFromLinkMock,
} = vi.hoisted(() => ({
  extractInterviewNotesInsightsMock: vi.fn(),
  getFeishuDocRawContentFromLinkMock: vi.fn(),
}));

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    generateInterviewQuestions: vi.fn(),
    extractInterviewNotesInsights: extractInterviewNotesInsightsMock,
  }),
}));

vi.mock('@/api/feishu', () => ({
  getFeishuDocRawContentFromLink: getFeishuDocRawContentFromLinkMock,
}));

vi.mock('@/utils/pdfStorage', () => ({
  getPDF: vi.fn(async () => ({
    data: new ArrayBuffer(8),
    filename: 'resume.pdf',
  })),
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

describe('InterviewPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    extractInterviewNotesInsightsMock.mockReset();
    getFeishuDocRawContentFromLinkMock.mockReset();
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
      screen.getByPlaceholderText('https://xxx.feishu.cn/docx/... 或 /wiki/...'),
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
});
