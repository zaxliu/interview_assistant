import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportButtons } from './ExportButtons';

const createDocMock = vi.fn();

vi.mock('@/hooks/useFeishuCalendar', () => ({
  useFeishuCalendar: () => ({
    isLoading: false,
    createDoc: createDocMock,
  }),
}));

const sampleResult = {
  interview_info: {
    interviewer: 'Lewis',
    overall_result: '通过' as const,
    interview_time: '2026-03-12 20:00',
  },
  evaluation_dimensions: [
    { dimension: '专业能力', score: 4, assessment_points: '良好' },
  ],
  summary: {
    suggested_level: 'P7',
    comprehensive_score: 4,
    overall_comment: '整体不错',
    interview_conclusion: '通过' as const,
    is_strongly_recommended: false,
  },
  additional_info: {
    strengths: ['沟通'],
    concerns: ['系统设计'],
    follow_up_questions: ['补充案例'],
  },
};

describe('ExportButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });

  it('shows export link after successful Feishu export', async () => {
    createDocMock.mockResolvedValue({
      success: true,
      message: 'ok',
      docUrl: 'https://feishu.cn/docx/doc-1',
    });

    render(
      <ExportButtons
        result={sampleResult}
        candidateName="Alice"
        positionTitle="Frontend"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('https://feishu.cn/docx/doc-1', '_blank');
    });
    expect(screen.getByRole('link', { name: 'https://feishu.cn/docx/doc-1' })).toHaveAttribute(
      'href',
      'https://feishu.cn/docx/doc-1'
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('copies exported doc link', async () => {
    createDocMock.mockResolvedValue({
      success: true,
      message: 'ok',
      docUrl: 'https://feishu.cn/docx/doc-2',
    });

    render(
      <ExportButtons
        result={sampleResult}
        candidateName="Alice"
        positionTitle="Frontend"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));
    await screen.findByRole('link', { name: 'https://feishu.cn/docx/doc-2' });

    fireEvent.click(screen.getByRole('button', { name: '复制链接' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://feishu.cn/docx/doc-2');
    });
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
  });

  it('overwrites previous success link on next success', async () => {
    createDocMock
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        docUrl: 'https://feishu.cn/docx/doc-old',
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        docUrl: 'https://feishu.cn/docx/doc-new',
      });

    render(
      <ExportButtons
        result={sampleResult}
        candidateName="Alice"
        positionTitle="Frontend"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));
    await screen.findByRole('link', { name: 'https://feishu.cn/docx/doc-old' });

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));
    await screen.findByRole('link', { name: 'https://feishu.cn/docx/doc-new' });

    expect(screen.queryByRole('link', { name: 'https://feishu.cn/docx/doc-old' })).not.toBeInTheDocument();
  });

  it('keeps previous success link when a later export fails', async () => {
    createDocMock
      .mockResolvedValueOnce({
        success: true,
        message: 'ok',
        docUrl: 'https://feishu.cn/docx/doc-ok',
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'boom',
      });

    render(
      <ExportButtons
        result={sampleResult}
        candidateName="Alice"
        positionTitle="Frontend"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));
    await screen.findByRole('link', { name: 'https://feishu.cn/docx/doc-ok' });

    fireEvent.click(screen.getByRole('button', { name: '导出到飞书' }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('导出到飞书失败：boom');
    });
    expect(screen.getByRole('link', { name: 'https://feishu.cn/docx/doc-ok' })).toBeInTheDocument();
  });
});
