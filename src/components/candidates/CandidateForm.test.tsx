import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CandidateForm } from './CandidateForm';
import { usePositionStore } from '@/store/positionStore';

const parseFromFile = vi.fn();
const parseFromUrl = vi.fn();

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

vi.mock('@/utils/pdfStorage', () => ({
  storePDF: vi.fn(),
}));

vi.mock('@/api/pdf', () => ({
  debugDownloadPDFPageAsImage: vi.fn(),
}));

describe('CandidateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePositionStore.setState({ positions: [], currentUserId: 'user-1' });
  });

  it('creates a candidate with manual resume text', () => {
    const onSave = vi.fn();

    render(<CandidateForm positionId="position-1" onSave={onSave} onCancel={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Candidate Name'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('Resume content will appear here after PDF upload, or paste manually...'), {
      target: { value: 'Candidate resume summary' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedCandidateId = onSave.mock.calls[0][0];
    expect(savedCandidateId).toBeTruthy();
  });

  it('parses a resume URL when requested', async () => {
    parseFromUrl.mockResolvedValue('Parsed resume');

    render(<CandidateForm positionId="position-1" onSave={() => undefined} onCancel={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText('Or paste direct PDF URL (not Wintalent page)'), {
      target: { value: 'https://example.com/resume.pdf' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse' }));

    expect(parseFromUrl).toHaveBeenCalledWith(
      'https://example.com/resume.pdf',
      true,
      { maxPages: 5 }
    );
  });
});
