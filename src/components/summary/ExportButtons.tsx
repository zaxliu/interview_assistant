import React, { useState } from 'react';
import type { InterviewResult } from '@/types';
import { Button } from '@/components/ui';
import { useFeishuCalendar } from '@/hooks/useFeishuCalendar';

interface ExportButtonsProps {
  result: InterviewResult;
  candidateName: string;
  positionTitle: string;
}

/**
 * Format interview result as markdown for copy
 */
const formatAsMarkdown = (
  result: InterviewResult,
  candidateName: string,
  positionTitle: string
): string => {
  let markdown = `# 面试结果 - ${candidateName} - ${positionTitle}\n\n`;

  markdown += `## 面试信息\n`;
  markdown += `- **面试官**: ${result.interview_info.interviewer}\n`;
  markdown += `- **面试时间**: ${result.interview_info.interview_time}\n`;
  markdown += `- **面试结果**: ${result.interview_info.overall_result}\n\n`;

  markdown += `## 评估维度\n\n`;
  result.evaluation_dimensions.forEach((dim) => {
    markdown += `### ${dim.dimension} (${dim.score}/5)\n`;
    markdown += `${dim.assessment_points}\n\n`;
  });

  markdown += `## 综合评价\n\n`;
  markdown += `- **建议定级**: ${result.summary.suggested_level}\n`;
  markdown += `- **综合评分**: ${result.summary.comprehensive_score}/5\n`;
  markdown += `- **面试结论**: ${result.summary.interview_conclusion}\n`;
  markdown += `- **强烈推荐**: ${result.summary.is_strongly_recommended ? '是' : '否'}\n\n`;
  markdown += `**评价内容**:\n${result.summary.overall_comment}\n\n`;

  if (result.additional_info) {
    markdown += `## 附加信息\n\n`;
    if (result.additional_info.strengths?.length) {
      markdown += `**优势**:\n`;
      result.additional_info.strengths.forEach((s) => {
        markdown += `- ${s}\n`;
      });
      markdown += '\n';
    }
    if (result.additional_info.concerns?.length) {
      markdown += `**担忧**:\n`;
      result.additional_info.concerns.forEach((c) => {
        markdown += `- ${c}\n`;
      });
      markdown += '\n';
    }
    if (result.additional_info.follow_up_questions?.length) {
      markdown += `**后续跟进**:\n`;
      result.additional_info.follow_up_questions.forEach((q) => {
        markdown += `- ${q}\n`;
      });
    }
  }

  return markdown;
};

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  result,
  candidateName,
  positionTitle,
}) => {
  const { isLoading: feishuLoading, createDoc } = useFeishuCalendar();
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [latestDocUrl, setLatestDocUrl] = useState<string | null>(null);
  const [latestExportMessage, setLatestExportMessage] = useState<string | null>(null);
  const [copyDocUrlSuccess, setCopyDocUrlSuccess] = useState(false);

  const handleFeishuExport = async () => {
    const response = await createDoc(result, candidateName, positionTitle);
    if (response.success && response.docUrl) {
      setLatestDocUrl(response.docUrl);
      setLatestExportMessage(response.message);
      setCopyDocUrlSuccess(false);
      window.open(response.docUrl, '_blank');
    } else if (!response.success) {
      alert(`导出到飞书失败：${response.message}`);
    }
  };

  const handleCopyMarkdown = async () => {
    const markdown = formatAsMarkdown(result, candidateName, positionTitle);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const handleCopyDocUrl = async () => {
    if (!latestDocUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(latestDocUrl);
      setCopyDocUrlSuccess(true);
      setTimeout(() => setCopyDocUrlSuccess(false), 2000);
    } catch (err) {
      console.error('复制文档链接失败:', err);
    }
  };

  const markdown = formatAsMarkdown(result, candidateName, positionTitle);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowCopyModal(true)}
          >
            复制 Markdown
          </Button>
          <Button
            onClick={handleFeishuExport}
            isLoading={feishuLoading}
          >
            导出到飞书
          </Button>
        </div>

        {latestDocUrl && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 flex flex-wrap items-center gap-2">
            <span className="font-medium">已导出到飞书：</span>
            <a
              href={latestDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline break-all text-green-700 hover:text-green-900"
            >
              {latestDocUrl}
            </a>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyDocUrl}
            >
              {copyDocUrlSuccess ? '已复制' : '复制链接'}
            </Button>
            {latestExportMessage && (
              <div className="w-full text-[11px] text-green-700">
                {latestExportMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copy Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Markdown 预览</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCopyMarkdown}
                >
                  {copySuccess ? '已复制！' : '复制到剪贴板'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCopyModal(false)}
                >
                  关闭
                </Button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto bg-gray-50 p-3 rounded text-xs text-gray-700 whitespace-pre-wrap">
              {markdown}
            </pre>
          </div>
        </div>
      )}
    </>
  );
};
