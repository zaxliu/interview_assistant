import React, { useState, useRef } from 'react';
import type { Candidate } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { usePDFParser } from '@/hooks/usePDFParser';
import { useResumeProcessor } from '@/hooks/useResumeProcessor';
import { storePDF } from '@/utils/pdfStorage';
import { debugDownloadPDFPageAsImage } from '@/api/pdf';
import { downloadWintalentResumePDF } from '@/api/wintalent';
import { Card, CardHeader, CardBody, CardFooter, Button, Input, Textarea } from '@/components/ui';
import { ResumeHighlightsPanel } from './ResumeHighlightsPanel';
import { emptyResumeHighlights, getPreferredResumeText, getRawResumeText } from '@/utils/resume';
import { zhCN as t } from '@/i18n/zhCN';

interface CandidateFormProps {
  positionId: string;
  candidate?: Candidate;
  onSave: (candidateId: string) => void;
  onCancel: () => void;
}

export const CandidateForm: React.FC<CandidateFormProps> = ({
  positionId,
  candidate,
  onSave,
  onCancel,
}) => {
  const { addCandidate, updateCandidate } = usePositionStore();
  const {
    isLoading: pdfLoading,
    error: pdfError,
    progress: parseProgress,
    parseFromFile,
    parseFromUrl,
    canUseAI,
  } = usePDFParser();
  const {
    isProcessing: resumeProcessing,
    error: resumeProcessingError,
    processResume,
  } = useResumeProcessor();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialResumeText = candidate ? getPreferredResumeText(candidate) : '';
  const initialResumeRawText = candidate ? getRawResumeText(candidate) : '';

  const [name, setName] = useState(candidate?.name || '');
  const [resumeUrl, setResumeUrl] = useState(candidate?.resumeUrl || '');
  const [wintalentLink, setWintalentLink] = useState(
    candidate?.candidateLink?.includes('wintalent.cn') ? candidate.candidateLink : ''
  );
  const [resumeText, setResumeText] = useState(initialResumeText);
  const [resumeRawText, setResumeRawText] = useState(initialResumeRawText);
  const [resumeHighlights, setResumeHighlights] = useState(candidate?.resumeHighlights || emptyResumeHighlights());
  const [resumeFilename, setResumeFilename] = useState(candidate?.resumeFilename || '');
  const [interviewTime, setInterviewTime] = useState(() => {
    if (!candidate?.interviewTime) return '';
    const date = new Date(candidate.interviewTime);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  });
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [useAIParsing, setUseAIParsing] = useState(true);
  const [wintalentLoading, setWintalentLoading] = useState(false);
  const [wintalentError, setWintalentError] = useState<string | null>(null);
  const isResumeBusy = pdfLoading || resumeProcessing || wintalentLoading;

  const applyProcessedResume = async (rawText: string) => {
    setResumeRawText(rawText);
    const processed = await processResume(rawText);
    setResumeText(processed.markdown);
    setResumeHighlights(processed.highlights);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('请上传 PDF 文件。如果你拿到的是 ZIP，请先解压后再上传 PDF。');
        return;
      }
      setResumeFilename(file.name);
      setPendingPdfFile(file); // Store for later IndexedDB save

      // Use AI parsing if enabled and available, otherwise standard
      const text = await parseFromFile(file, useAIParsing && canUseAI, { maxPages: 5 });
      if (text) {
        await applyProcessedResume(text);
      }
    }
  };

  const handleUrlParse = async () => {
    if (resumeUrl) {
      // Use AI parsing if enabled and available, otherwise standard
      const text = await parseFromUrl(resumeUrl, useAIParsing && canUseAI, { maxPages: 5 });
      if (text) {
        await applyProcessedResume(text);
      }
    }
  };

  const handleWintalentImport = async () => {
    const link = wintalentLink.trim();
    if (!link) return;

    setWintalentError(null);
    setWintalentLoading(true);

    try {
      const { blob, filename } = await downloadWintalentResumePDF(link);
      const pdfFile = new File([blob], filename, {
        type: blob.type || 'application/pdf',
      });

      setResumeFilename(pdfFile.name);
      setPendingPdfFile(pdfFile);
      setResumeUrl(link);

      const text = await parseFromFile(pdfFile, useAIParsing && canUseAI, { maxPages: 5 });
      if (text) {
        await applyProcessedResume(text);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '从 Wintalent 导入简历失败';
      setWintalentError(message);
    } finally {
      setWintalentLoading(false);
    }
  };

  const handleReprocessResume = async () => {
    await applyProcessedResume(resumeRawText || resumeText);
  };

  const handleSubmit = async () => {
    const candidateData = {
      name,
      resumeUrl,
      resumeText: resumeText || resumeRawText,
      resumeRawText: resumeRawText || resumeText,
      resumeMarkdown: resumeText || resumeRawText,
      resumeHighlights,
      resumeFilename,
      status: candidate?.status || 'pending',
      interviewTime: interviewTime || undefined,
    };

    try {
      if (candidate) {
        updateCandidate(positionId, candidate.id, candidateData);
        // Store PDF in IndexedDB if a new file was uploaded
        if (pendingPdfFile) {
          console.log('[CandidateForm] Storing PDF for existing candidate:', candidate.id);
          await storePDF(candidate.id, pendingPdfFile);
          console.log('[CandidateForm] PDF stored successfully');
        }
        onSave(candidate.id);
      } else {
        const newCandidate = addCandidate(positionId, candidateData);
        // Store PDF in IndexedDB if a file was uploaded
        if (pendingPdfFile) {
          console.log('[CandidateForm] Storing PDF for new candidate:', newCandidate.id);
          await storePDF(newCandidate.id, pendingPdfFile);
          console.log('[CandidateForm] PDF stored successfully');
        }
        onSave(newCandidate.id);
      }
    } catch (error) {
      console.error('[CandidateForm] Error saving candidate:', error);
      alert('保存候选人失败，请重试。');
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">
          {candidate ? '编辑候选人' : '新增候选人'}
        </h3>
      </CardHeader>
      <CardBody className="space-y-3">
        <Input
          label="候选人姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="请输入姓名"
        />

        <Input
          label="面试时间"
          type="datetime-local"
          value={interviewTime}
          onChange={(e) => setInterviewTime(e.target.value)}
        />

        {(candidate?.interviewLink || candidate?.candidateLink) && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">日历链接</p>
            {candidate?.interviewLink && (
              <div className="text-sm">
                <span className="text-gray-500">视频面试：</span>{' '}
                <a
                  href={candidate.interviewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800 break-all"
                >
                  {candidate.interviewLink}
                </a>
              </div>
            )}
            {candidate?.candidateLink && (
              <div className="text-sm">
                <span className="text-gray-500">候选人资料：</span>{' '}
                <a
                  href={candidate.candidateLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800 break-all"
                >
                  {candidate.candidateLink}
                </a>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            简历
          </label>

          {/* Instructions */}
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
            <p className="font-medium mb-2">Wintalent 导入说明：</p>
            <p className="mb-2">推荐：粘贴面试链接后，点击<strong>导入</strong>。</p>
            <p className="font-medium mb-1">手动兜底：</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>打开日历事件中的“候选人链接”</li>
              <li>在 Wintalent 页面点击文件旁“预览”</li>
              <li>下载 ZIP 后先<strong>解压</strong></li>
              <li>上传解压后的<strong>PDF 文件</strong>（不要传 ZIP）</li>
            </ol>
          </div>

          {/* Error display */}
          {(pdfError || resumeProcessingError || wintalentError) && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {wintalentError || pdfError || resumeProcessingError}
            </div>
          )}

          {/* AI Parsing Toggle */}
          {canUseAI && (
            <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded-md">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAIParsing}
                  onChange={(e) => setUseAIParsing(e.target.checked)}
                  className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-xs text-purple-800">
                  <strong>AI 智能解析</strong> - 更适合扫描件和复杂排版
                </span>
              </label>
              {useAIParsing && (
                <p className="text-xs text-purple-600 mt-1 ml-6">
                  使用 AI Vision 抽取文本，默认仅解析前 5 页。
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            {/* Wintalent link import */}
            <div className="flex gap-2">
              <Input
                type="url"
                value={wintalentLink}
                onChange={(e) => setWintalentLink(e.target.value)}
                placeholder="粘贴 Wintalent 面试链接，一键导入"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleWintalentImport}
                disabled={!wintalentLink.trim() || isResumeBusy}
                isLoading={wintalentLoading}
              >
                {t.common.import}
              </Button>
            </div>

            {/* File upload */}
            <div className="flex gap-2 items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                isLoading={isResumeBusy}
              >
                {isResumeBusy ? '解析中...' : '上传 PDF'}
              </Button>
              {resumeFilename && !isResumeBusy && (
                <span className="text-sm text-green-600 flex items-center">
                  ✓ {resumeFilename}
                </span>
              )}
            </div>

            {/* Progress bar for AI parsing */}
            {pdfLoading && parseProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>AI 正在解析...</span>
                  <span>{parseProgress.current} / {parseProgress.total} 页</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(parseProgress.current / parseProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {resumeProcessing && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                正在整理简历内容并生成亮点...
              </div>
            )}

            {/* Debug button - only show when PDF is loaded and not parsing */}
            {!pdfLoading && pendingPdfFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await debugDownloadPDFPageAsImage(pendingPdfFile, 0, 3);
                  } catch (err) {
                    console.error('Debug download failed:', err);
                  }
                }}
                className="text-xs text-gray-500"
              >
                🐛 下载第 1 页图片
              </Button>
            )}

            {/* URL input */}
            <div className="flex gap-2">
              <Input
                type="url"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                placeholder="或粘贴 PDF 直链（非 Wintalent 页面）"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUrlParse}
                disabled={!resumeUrl || isResumeBusy}
                isLoading={isResumeBusy}
              >
                {t.common.parse}
              </Button>
            </div>

            {/* Resume text preview */}
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">
                {resumeText
                  ? '规范化简历（Markdown，可编辑）：'
                  : '简历文本（上传 PDF 或手动粘贴）：'}
              </p>
              <Textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={8}
                className="text-xs"
                placeholder="上传 PDF 后将在此显示简历内容，也可手动粘贴..."
                autoResize
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReprocessResume}
                disabled={isResumeBusy || !(resumeRawText || resumeText)}
                isLoading={resumeProcessing}
              >
                刷新亮点
              </Button>
            </div>

            <ResumeHighlightsPanel
              highlights={resumeHighlights}
              title="简历亮点"
              emptyText="上传或粘贴简历后，可自动生成亮点。"
            />

            {(resumeRawText || resumeText) && (
              <details className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-gray-600">
                  原始提取文本
                </summary>
                <Textarea
                  value={resumeRawText}
                  onChange={(e) => setResumeRawText(e.target.value)}
                  rows={6}
                  className="text-xs mt-2"
                  autoResize
                  placeholder="原始 OCR 文本会显示在这里..."
                />
              </details>
            )}
          </div>
        </div>
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button onClick={handleSubmit} disabled={!name.trim() || isResumeBusy}>
          {candidate ? t.common.saveChanges : '新增候选人'}
        </Button>
      </CardFooter>
    </Card>
  );
};
