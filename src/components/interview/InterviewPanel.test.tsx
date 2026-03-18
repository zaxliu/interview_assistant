import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPanel } from './InterviewPanel';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import type { Candidate, Position } from '@/types';

vi.mock('@/hooks/useAI', () => ({
  useAI: () => ({
    isLoading: false,
    generateInterviewQuestions: vi.fn(),
    extractInterviewNotesInsights: vi.fn(),
  }),
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
});
