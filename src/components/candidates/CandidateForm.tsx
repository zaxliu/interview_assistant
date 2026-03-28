import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AIUsage, Candidate } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePDFParser } from '@/hooks/usePDFParser';
import { useResumeProcessor } from '@/hooks/useResumeProcessor';
import { deletePDF, storePDF } from '@/utils/pdfStorage';
import { debugDownloadPDFPageAsImage } from '@/api/pdf';
import {
  downloadWintalentResumePDF,
  fetchWintalentCandidateData,
  fetchWintalentResumeText,
  isWintalentResumeUnavailableMessage,
} from '@/api/wintalent';
import { Card, CardHeader, CardBody, CardFooter, Button, Input, Textarea } from '@/components/ui';
import { ResumeHighlightsPanel } from './ResumeHighlightsPanel';
import { HistoricalInterviewReviewsPanel } from './HistoricalInterviewReviewsPanel';
import { emptyResumeHighlights, getPreferredResumeText, getRawResumeText } from '@/utils/resume';
import { formatInterviewTimeForInput, normalizeInterviewTimeForSave } from '@/utils/dateTime';
import { zhCN as t } from '@/i18n/zhCN';
import { reportError, trackEvent, usageFromAIUsage } from '@/lib/analytics';
import { isWintalentInterviewLink } from '@/api/wintalent';
import { enqueueSerialTask } from '@/utils/serialTaskQueue';

const AUTO_SAVE_DELAY = 800;

interface CandidateFormProps {
  positionId: string;
  candidate?: Candidate;
  autoImportOnMount?: boolean;
  onSave: (candidateId: string) => void;
  onCancel: () => void;
}

export const CandidateForm: React.FC<CandidateFormProps> = ({
  positionId,
  candidate,
  autoImportOnMount = false,
  onSave,
  onCancel,
}) => {
  const { addCandidate, updateCandidate } = usePositionStore();
  const aiModel = useSettingsStore((state) => state.aiModel);
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
  const [resumeViewerMode, setResumeViewerMode] = useState<Candidate['resumeViewerMode']>(candidate?.resumeViewerMode);
  const [resumeHighlights, setResumeHighlights] = useState(candidate?.resumeHighlights || emptyResumeHighlights());
  const [historicalInterviewReviews, setHistoricalInterviewReviews] = useState(
    candidate?.historicalInterviewReviews || []
  );
  const [resumeProcessingUsage, setResumeProcessingUsage] = useState<AIUsage | undefined>(
    candidate?.aiUsage?.resumeProcessing
  );
  const [resumeOCRUsage, setResumeOCRUsage] = useState<AIUsage | undefined>(
    candidate?.aiUsage?.resumeOCR
  );
  const [resumeFilename, setResumeFilename] = useState(candidate?.resumeFilename || '');
  const [interviewTime, setInterviewTime] = useState(() => formatInterviewTimeForInput(candidate?.interviewTime));
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [needsPdfPersist, setNeedsPdfPersist] = useState(false);
  const [useAIParsing, setUseAIParsing] = useState(true);
  const [wintalentTrigger, setWintalentTrigger] = useState<'auto_from_start' | 'manual' | null>(null);
  const [wintalentQueued, setWintalentQueued] = useState(false);
  const [wintalentLoading, setWintalentLoading] = useState(false);
  const [wintalentError, setWintalentError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'saving' | 'unsaved'>(
    candidate ? 'saved' : 'idle'
  );
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedCandidateIdRef = useRef<string | null>(candidate?.id || null);
  const isHydratingRef = useRef(true);
  const autoImportAttemptedRef = useRef(false);
  const isResumeBusy = pdfLoading || resumeProcessing || wintalentLoading || wintalentQueued;
  const hasResumeContent = Boolean(
    resumeText.trim() || resumeRawText.trim() || resumeFilename.trim()
  );
  const displayedResumeError = wintalentError && isWintalentResumeUnavailableMessage(wintalentError)
    ? `${wintalentError} 您可以手动上传之前已经获取的简历PDF。`
    : (wintalentError || pdfError || resumeProcessingError);
  const canAutoImportFromLink = Boolean(
    candidate?.id &&
    !hasResumeContent &&
    wintalentLink.trim() &&
    isWintalentInterviewLink(wintalentLink)
  );

  const previewDebugText = (content: string, limit: number = 300): string => (
    content.length > limit ? `${content.slice(0, limit)}...` : content
  );

  const mergeUsage = (base?: AIUsage, extra?: AIUsage): AIUsage | undefined => {
    if (!base && !extra) {
      return undefined;
    }
    return {
      input: (base?.input || 0) + (extra?.input || 0),
      cached: (base?.cached || 0) + (extra?.cached || 0),
      output: (base?.output || 0) + (extra?.output || 0),
    };
  };

  const applyProcessedResume = useCallback(async (rawText: string) => {
    console.log('[CandidateForm] applyProcessedResume start', {
      rawTextLength: rawText.length,
      rawTextPreview: previewDebugText(rawText),
    });
    setResumeRawText(rawText);
    const processed = await processResume(rawText);
    console.log('[CandidateForm] applyProcessedResume result', {
      markdownLength: processed.markdown.length,
      markdownPreview: previewDebugText(processed.markdown),
      highlights: {
        summary: processed.highlights.summary,
        strengthsCount: processed.highlights.strengths.length,
        risksCount: processed.highlights.risks.length,
        experienceCount: processed.highlights.experience.length,
        keywordsCount: processed.highlights.keywords.length,
      },
      usage: processed.usage,
    });
    setResumeText(processed.markdown);
    setResumeHighlights(processed.highlights);
    setResumeProcessingUsage(processed.usage);
    return processed;
  }, [processResume]);

  const renderUsage = (usage: AIUsage | undefined, label: string) => {
    if (!usage) return null;

    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="ml-2">input {usage.input}</span>
        <span className="ml-2">cached {usage.cached}</span>
        <span className="ml-2">output {usage.output}</span>
      </div>
    );
  };

  useEffect(() => {
    persistedCandidateIdRef.current = candidate?.id || null;
    isHydratingRef.current = true;
    setName(candidate?.name || '');
    setResumeUrl(candidate?.resumeUrl || '');
    setWintalentLink(candidate?.candidateLink?.includes('wintalent.cn') ? candidate.candidateLink : '');
    setResumeText(candidate ? getPreferredResumeText(candidate) : '');
    setResumeRawText(candidate ? getRawResumeText(candidate) : '');
    setResumeViewerMode(candidate?.resumeViewerMode);
    setResumeHighlights(candidate?.resumeHighlights || emptyResumeHighlights());
    setHistoricalInterviewReviews(candidate?.historicalInterviewReviews || []);
    setResumeOCRUsage(candidate?.aiUsage?.resumeOCR);
    setResumeProcessingUsage(candidate?.aiUsage?.resumeProcessing);
    setResumeFilename(candidate?.resumeFilename || '');
    setPendingPdfFile(null);
    setNeedsPdfPersist(false);
    setWintalentTrigger(null);
    setWintalentQueued(false);
    setSaveStatus(candidate ? 'saved' : 'idle');
    setInterviewTime(formatInterviewTimeForInput(candidate?.interviewTime));
    autoImportAttemptedRef.current = false;
    queueMicrotask(() => {
      isHydratingRef.current = false;
    });
  }, [candidate]);

  const buildCandidateData = useCallback(() => ({
    name,
    resumeUrl,
    resumeViewerMode,
    resumeText,
    resumeRawText: resumeRawText || resumeText,
    resumeMarkdown: resumeText,
    resumeHighlights,
    historicalInterviewReviews,
    aiUsage: {
      ...candidate?.aiUsage,
      resumeOCR: resumeOCRUsage,
      resumeProcessing: resumeProcessingUsage,
    },
    resumeFilename,
    candidateLink: wintalentLink.trim() || candidate?.candidateLink,
    status: candidate?.status || 'pending',
    interviewTime: normalizeInterviewTimeForSave(interviewTime),
  }), [
    candidate?.aiUsage,
    candidate?.candidateLink,
    candidate?.status,
    historicalInterviewReviews,
    interviewTime,
    name,
    resumeFilename,
    resumeHighlights,
    resumeOCRUsage,
    resumeProcessingUsage,
    resumeRawText,
    resumeText,
    resumeUrl,
    resumeViewerMode,
    wintalentLink,
  ]);

  const persistCandidate = useCallback(async (): Promise<string | null> => {
    const candidateData = buildCandidateData();
    const existingCandidateId = persistedCandidateIdRef.current;
    const shouldCreateDraft = !existingCandidateId && candidateData.name.trim();
    if (!existingCandidateId && !shouldCreateDraft) {
      setSaveStatus('idle');
      return null;
    }

    setSaveStatus('saving');
    const savedCandidateId = existingCandidateId || addCandidate(positionId, candidateData).id;
    if (!existingCandidateId) {
      persistedCandidateIdRef.current = savedCandidateId;
    } else {
      updateCandidate(positionId, savedCandidateId, candidateData);
    }

    if (pendingPdfFile && needsPdfPersist) {
      await storePDF(savedCandidateId, pendingPdfFile);
      setNeedsPdfPersist(false);
    }

    setSaveStatus('saved');
    return savedCandidateId;
  }, [addCandidate, buildCandidateData, needsPdfPersist, pendingPdfFile, positionId, updateCandidate]);

  useEffect(() => {
    if (isHydratingRef.current) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    const hasDraftData = Boolean(
      name.trim() ||
      resumeText.trim() ||
      resumeRawText.trim() ||
      resumeUrl.trim() ||
      resumeFilename.trim() ||
      historicalInterviewReviews.length ||
      interviewTime
    );
    if (!hasDraftData) {
      setSaveStatus(candidate ? 'saved' : 'idle');
      return;
    }

    setSaveStatus('unsaved');
    autosaveTimerRef.current = setTimeout(() => {
      persistCandidate().catch((error) => {
        console.error('[CandidateForm] Error autosaving candidate:', error);
        setSaveStatus('unsaved');
      });
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    candidate,
    historicalInterviewReviews,
    interviewTime,
    name,
    persistCandidate,
    resumeFilename,
    resumeRawText,
    resumeText,
    resumeUrl,
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const startedAt = Date.now();
      // Check file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('请上传 PDF 文件。如果你拿到的是 ZIP，请先解压后再上传 PDF。');
        return;
      }
      setResumeFilename(file.name);
      setResumeViewerMode('pdf');
      setPendingPdfFile(file); // Store for later IndexedDB save
      setNeedsPdfPersist(true);

      // Use AI parsing if enabled and available, otherwise standard
      const result = await parseFromFile(file, useAIParsing && canUseAI, { maxPages: 5 });
      setResumeOCRUsage(result.usage);
      if (result.text) {
        const processed = await applyProcessedResume(result.text);
        const combinedUsage = mergeUsage(result.usage, processed.usage);
        trackEvent({
          eventName: 'resume_import_succeeded',
          feature: 'resume_import',
          success: true,
          durationMs: Date.now() - startedAt,
          model: canUseAI && useAIParsing ? aiModel : undefined,
          ...usageFromAIUsage(combinedUsage),
          details: {
            method: 'file',
          },
        });
      } else {
        reportError({
          error: pdfError || resumeProcessingError || 'empty_resume_text',
          feature: 'resume_import',
          errorCategory: 'pdf',
          durationMs: Date.now() - startedAt,
          model: canUseAI && useAIParsing ? aiModel : undefined,
          requestContext: {
            operation: 'import_resume_file',
            provider: useAIParsing && canUseAI ? 'openai-compatible' : 'pdfjs',
          },
          reproContext: {
            route: window.location.pathname,
            positionId,
            candidateId: candidate?.id,
            useAIParsing: useAIParsing && canUseAI,
            viewMode: 'pdf',
          },
          inputSnapshot: {
            filename: file.name,
            fileSize: file.size,
            method: 'file',
          },
        });
        trackEvent({
          eventName: 'resume_import_failed',
          feature: 'resume_import',
          success: false,
          durationMs: Date.now() - startedAt,
          errorCode: pdfError || resumeProcessingError || 'empty_resume_text',
          details: {
            method: 'file',
          },
        });
      }
    }
  };

  const handleUrlParse = async () => {
    if (resumeUrl) {
      const startedAt = Date.now();
      setResumeViewerMode('pdf');
      // Use AI parsing if enabled and available, otherwise standard
      const result = await parseFromUrl(resumeUrl, useAIParsing && canUseAI, { maxPages: 5 });
      setResumeOCRUsage(result.usage);
      if (!result.text.trim()) {
        reportError({
          error: pdfError || 'empty_resume_text',
          feature: 'resume_import',
          errorCategory: 'pdf',
          durationMs: Date.now() - startedAt,
          model: canUseAI && useAIParsing ? aiModel : undefined,
          requestContext: {
            operation: 'import_resume_url',
            provider: useAIParsing && canUseAI ? 'openai-compatible' : 'pdfjs',
          },
          reproContext: {
            route: window.location.pathname,
            positionId,
            candidateId: candidate?.id,
            useAIParsing: useAIParsing && canUseAI,
            viewMode: 'pdf',
          },
          inputSnapshot: {
            url: resumeUrl,
            method: 'url',
          },
        });
        trackEvent({
          eventName: 'resume_import_failed',
          feature: 'resume_import',
          success: false,
          durationMs: Date.now() - startedAt,
          errorCode: pdfError || 'empty_resume_text',
          details: {
            method: 'url',
          },
        });
        alert('简历链接内容获取失败，请检查链接是否可访问且为 PDF 直链。');
        return;
      }
      const processed = await applyProcessedResume(result.text);
      const combinedUsage = mergeUsage(result.usage, processed.usage);
      trackEvent({
        eventName: 'resume_import_succeeded',
        feature: 'resume_import',
        success: true,
        durationMs: Date.now() - startedAt,
        model: canUseAI && useAIParsing ? aiModel : undefined,
        ...usageFromAIUsage(combinedUsage),
        details: {
          method: 'url',
        },
      });
    }
  };

  const runWintalentImport = useCallback(async (trigger: 'auto_from_start' | 'manual') => {
    const link = wintalentLink.trim();
    if (!link) return;

    setWintalentError(null);
    setWintalentLoading(true);

    try {
      const startedAt = Date.now();
      setResumeUrl(link);
      const candidateDataPromise = fetchWintalentCandidateData(link).catch(() => ({ historicalInterviewReviews: [] }));

      try {
        const { blob, filename } = await downloadWintalentResumePDF(link);
        const candidateData = await candidateDataPromise;
        const pdfFile = new File([blob], filename, {
          type: blob.type || 'application/pdf',
        });

        setResumeFilename(pdfFile.name);
        setResumeViewerMode('pdf');
        setPendingPdfFile(pdfFile);
        setNeedsPdfPersist(true);
        setHistoricalInterviewReviews(candidateData.historicalInterviewReviews || []);

        const result = await parseFromFile(pdfFile, useAIParsing && canUseAI, { maxPages: 5 });
        setResumeOCRUsage(result.usage);
        if (result.text) {
          const processed = await applyProcessedResume(result.text);
          const combinedUsage = mergeUsage(result.usage, processed.usage);
          trackEvent({
            eventName: 'resume_import_succeeded',
            feature: 'resume_import',
            success: true,
            durationMs: Date.now() - startedAt,
            model: canUseAI && useAIParsing ? aiModel : undefined,
            ...usageFromAIUsage(combinedUsage),
            details: {
              method: 'wintalent',
              source: 'pdf',
              trigger,
            },
          });
        } else {
          trackEvent({
            eventName: 'resume_import_failed',
            feature: 'resume_import',
            success: false,
            durationMs: Date.now() - startedAt,
            errorCode: pdfError || resumeProcessingError || 'empty_resume_text',
            details: {
              method: 'wintalent',
              source: 'pdf',
              trigger,
            },
          });
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '从 Wintalent 导入简历失败';
        if (!message.includes('原始简历查看权限')) {
          throw error;
        }

        const [resumeData, candidateData] = await Promise.all([
          fetchWintalentResumeText(link),
          candidateDataPromise,
        ]);
        if (persistedCandidateIdRef.current) {
          await deletePDF(persistedCandidateIdRef.current).catch(() => undefined);
        }
        setResumeFilename(resumeData.title || 'Wintalent 标准简历');
        setResumeViewerMode('html');
        setPendingPdfFile(null);
        setNeedsPdfPersist(false);
        setResumeOCRUsage(undefined);
        setHistoricalInterviewReviews(candidateData.historicalInterviewReviews || []);
        const processed = await applyProcessedResume(resumeData.text);
        trackEvent({
          eventName: 'resume_import_succeeded',
          feature: 'resume_import',
          success: true,
          durationMs: Date.now() - startedAt,
          model: aiModel,
          ...usageFromAIUsage(processed.usage),
          details: {
            method: 'wintalent',
            source: 'html',
            trigger,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '从 Wintalent 导入简历失败';
      const isResumeUnavailable = isWintalentResumeUnavailableMessage(message);
      setWintalentError(message);
      if (isResumeUnavailable) {
        trackEvent({
          eventName: 'wintalent_resume_unavailable_detected',
          feature: 'resume_import',
          success: true,
          details: {
            method: 'wintalent',
            trigger,
            action: 'filtered',
          },
        });
      } else {
        reportError({
          error,
          feature: 'resume_import',
          errorCategory: 'wintalent',
          requestContext: {
            endpoint: '/api/wintalent/download',
            method: 'POST',
            provider: 'wintalent',
            operation: 'import_wintalent_resume',
          },
          reproContext: {
            route: window.location.pathname,
            positionId,
            candidateId: candidate?.id,
            useAIParsing: useAIParsing && canUseAI,
            viewMode: 'pdf',
          },
          inputSnapshot: {
            wintalentLink: link,
            method: 'wintalent',
          },
        });
      }
      trackEvent({
        eventName: 'resume_import_failed',
        feature: 'resume_import',
        success: false,
        errorCode: message,
        details: {
          method: 'wintalent',
          trigger,
          reason: isResumeUnavailable ? 'resume_unavailable' : 'error',
        },
      });
    } finally {
      setWintalentLoading(false);
    }
  }, [
    aiModel,
    applyProcessedResume,
    canUseAI,
    candidate?.id,
    parseFromFile,
    pdfError,
    positionId,
    resumeProcessingError,
    useAIParsing,
    wintalentLink,
  ]);

  const queueWintalentImport = useCallback(
    async (trigger: 'auto_from_start' | 'manual') => {
      setWintalentQueued(true);
      try {
        setWintalentTrigger(trigger);
        await enqueueSerialTask(() => runWintalentImport(trigger));
      } finally {
        setWintalentQueued(false);
        setWintalentTrigger(null);
      }
    },
    [runWintalentImport]
  );

  const handleWintalentImport = async () => {
    await queueWintalentImport('manual');
  };

  useEffect(() => {
    if (!autoImportOnMount || autoImportAttemptedRef.current || isResumeBusy || !canAutoImportFromLink) {
      return;
    }

    autoImportAttemptedRef.current = true;
    queueWintalentImport('auto_from_start').catch((error) => {
      console.error('[CandidateForm] Error auto importing Wintalent resume:', error);
    });
  }, [autoImportOnMount, canAutoImportFromLink, isResumeBusy, queueWintalentImport]);

  const handleReprocessResume = async () => {
    await applyProcessedResume(resumeRawText || resumeText);
  };

  const handleSubmit = async () => {
    try {
      const savedCandidateId = await persistCandidate();
      if (savedCandidateId) {
        onSave(savedCandidateId);
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
        <p className={`mt-1 text-xs ${
          saveStatus === 'saved' ? 'text-green-600' :
          saveStatus === 'saving' ? 'text-amber-600' :
          saveStatus === 'unsaved' ? 'text-gray-500' :
          'text-gray-400'
        }`}>
          {saveStatus === 'saved' && '✓ 已自动保存'}
          {saveStatus === 'saving' && '正在自动保存...'}
          {saveStatus === 'unsaved' && '内容已变更，稍后自动保存'}
          {saveStatus === 'idle' && '输入后会自动保存'}
        </p>
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
          {displayedResumeError && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {displayedResumeError}
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

            {wintalentQueued && !wintalentLoading && wintalentTrigger === 'auto_from_start' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                正在等待自动导入简历...
              </div>
            )}

            {wintalentLoading && wintalentTrigger === 'auto_from_start' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                正在自动导入简历...
              </div>
            )}

            {renderUsage(resumeOCRUsage, 'AI OCR Token')}
            {renderUsage(resumeProcessingUsage, 'AI 简历整理 Token')}

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

            <HistoricalInterviewReviewsPanel
              reviews={historicalInterviewReviews}
              title="历史面评"
              emptyText="从 Wintalent 导入后，如存在历史面评会显示在这里。"
              defaultExpanded={false}
            />

            {(resumeRawText || resumeText) && (
              <details className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-gray-600">
                  {resumeViewerMode === 'html' ? '原始 HTML 提取文本' : '原始提取文本'}
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
          {candidate || persistedCandidateIdRef.current ? '进入面试' : '新增候选人并进入面试'}
        </Button>
      </CardFooter>
    </Card>
  );
};
