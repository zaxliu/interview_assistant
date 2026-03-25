import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AIUsage, Position, Candidate } from '@/types';
import { QuestionList } from './QuestionList';
import { AddQuestionForm } from './AddQuestionForm';
import { PDFViewer } from '@/components/ui/PDFViewer';
import { Card, CardHeader, CardBody, Button, Textarea, Input } from '@/components/ui';
import { useAI } from '@/hooks/useAI';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import { getPDF } from '@/utils/pdfStorage';
import { getPreferredResumeText } from '@/utils/resume';
import { ResumeHighlightsPanel } from '@/components/candidates/ResumeHighlightsPanel';
import { HistoricalInterviewReviewsPanel } from '@/components/candidates/HistoricalInterviewReviewsPanel';
import { getFeishuDocRawContentFromLink } from '@/api/feishu';
import { zhCN as t } from '@/i18n/zhCN';
import { trackEvent, usageFromAIUsage } from '@/lib/analytics';

interface InterviewPanelProps {
  position: Position;
  candidate: Candidate;
  showPdfViewer?: boolean;
}

const isFeishuPermissionError = (message: string | null): boolean => {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return [
    'forbidden',
    'access denied',
    'permission',
    '无权限',
    '权限不足',
    '没有权限',
    '403',
    '1770032',
  ].some((keyword) => normalized.includes(keyword.toLowerCase()));
};

export const InterviewPanel: React.FC<InterviewPanelProps> = ({
  position,
  candidate,
  showPdfViewer: showPdfViewerProp = true,
}) => {
  const navigate = useNavigate();
  const { isLoading: aiLoading, generateInterviewQuestions, extractInterviewNotesInsights } = useAI();
  const {
    setQuestions,
    addQuestion,
    updateCandidate,
    updateQuestion,
  } = usePositionStore();

  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [quickNotesDraft, setQuickNotesDraft] = useState(candidate.quickNotes || '');
  const [meetingNotesUrl, setMeetingNotesUrl] = useState('');
  const [isImportingMeetingNotes, setIsImportingMeetingNotes] = useState(false);
  const [meetingImportStatus, setMeetingImportStatus] = useState<string | null>(null);
  const [meetingImportError, setMeetingImportError] = useState<string | null>(null);
  const [questionGenerationUsage, setQuestionGenerationUsage] = useState<AIUsage | undefined>(
    candidate.aiUsage?.questionGeneration
  );
  const [meetingNotesUsage, setMeetingNotesUsage] = useState<AIUsage | undefined>(
    candidate.aiUsage?.meetingNotesExtraction
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const snapshotButtonRef = useRef<HTMLButtonElement>(null);
  const snapshotPanelRef = useRef<HTMLDivElement>(null);
  const quickNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    interviewSplitRatio,
    setInterviewSplitRatio,
    aiModel,
    feishuUserAccessToken,
    feishuAppId,
    feishuAppSecret,
  } = useSettingsStore();
  const setHasPdf = useInterviewUIStore((state) => state.setHasPdf);

  const renderUsage = (usage: AIUsage | undefined, label: string) => {
    if (!usage) {
      return null;
    }

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
    const loadPdf = async () => {
      try {
        const pdf = await getPDF(candidate.id);
        if (pdf) {
          setPdfData(pdf.data);
          setPdfFilename(pdf.filename);
          setHasPdf(true);
          return;
        }
        setHasPdf(false);
      } catch (error) {
        console.error('Failed to load PDF:', error);
        setHasPdf(false);
      }
    };
    loadPdf();
  }, [candidate.id, setHasPdf]);

  useEffect(() => {
    setQuickNotesDraft(candidate.quickNotes || '');
  }, [candidate.id, candidate.quickNotes]);

  useEffect(() => {
    setIsSnapshotOpen(false);
  }, [candidate.id]);

  useEffect(() => {
    if (!isSnapshotOpen) {
      return;
    }

    const handlePointerDownOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }

      if (snapshotButtonRef.current?.contains(targetNode) || snapshotPanelRef.current?.contains(targetNode)) {
        return;
      }

      setIsSnapshotOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
    };
  }, [isSnapshotOpen]);

  useEffect(() => {
    setMeetingNotesUrl(candidate.interviewLink || '');
    setMeetingImportStatus(null);
    setMeetingImportError(null);
  }, [candidate.id, candidate.interviewLink]);

  useEffect(() => {
    setQuestionGenerationUsage(candidate.aiUsage?.questionGeneration);
    setMeetingNotesUsage(candidate.aiUsage?.meetingNotesExtraction);
  }, [candidate.aiUsage?.meetingNotesExtraction, candidate.aiUsage?.questionGeneration, candidate.id]);

  useEffect(() => {
    if (quickNotesTimerRef.current) {
      clearTimeout(quickNotesTimerRef.current);
    }

    if (quickNotesDraft === (candidate.quickNotes || '')) {
      return;
    }

    quickNotesTimerRef.current = setTimeout(() => {
      updateCandidate(position.id, candidate.id, { quickNotes: quickNotesDraft });
    }, 250);

    return () => {
      if (quickNotesTimerRef.current) {
        clearTimeout(quickNotesTimerRef.current);
      }
    };
  }, [candidate.id, candidate.quickNotes, position.id, quickNotesDraft, updateCandidate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      const clampedRatio = Math.min(0.8, Math.max(0.2, newRatio));
      setInterviewSplitRatio(clampedRatio);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setInterviewSplitRatio]);

  const handleGenerateQuestions = async () => {
    const resumeContent = getPreferredResumeText(candidate);
    if (!position.description || !resumeContent) {
      alert('请先补充岗位描述与候选人简历');
      return;
    }
    const startedAt = Date.now();

    const generated = await generateInterviewQuestions(
      position.description,
      resumeContent,
      position.criteria,
      candidate.historicalInterviewReviews
    );

    if (generated.data.length > 0) {
      setQuestions(position.id, candidate.id, generated.data);
      if (generated.usage) {
        setQuestionGenerationUsage(generated.usage);
        updateCandidate(position.id, candidate.id, {
          aiUsage: {
            ...candidate.aiUsage,
            questionGeneration: generated.usage,
          },
        });
      }
      trackEvent({
        eventName: 'question_generation_succeeded',
        feature: 'question_generation',
        success: true,
        durationMs: Date.now() - startedAt,
        model: aiModel,
        ...usageFromAIUsage(generated.usage),
        details: {
          questions: generated.data.length,
        },
      });
      return;
    }

    trackEvent({
      eventName: 'question_generation_failed',
      feature: 'question_generation',
      success: false,
      durationMs: Date.now() - startedAt,
      model: aiModel,
      errorCode: 'empty_question_list',
    });
  };

  const handleQuickNotesChange = (quickNotes: string) => {
    setQuickNotesDraft(quickNotes);
  };

  const normalizeQuestionText = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

  const buildImportedNotes = (answer: string, evidence?: string): string => {
    const lines = [`[来自会议纪要导入] ${answer.trim()}`];
    if (evidence?.trim()) {
      lines.push(`依据：${evidence.trim()}`);
    }
    return lines.join('\n');
  };

  const handleExtractFromMeetingNotes = async () => {
    const trimmedUrl = meetingNotesUrl.trim();
    if (!trimmedUrl) {
      setMeetingImportError('请输入飞书会议纪要链接。');
      setMeetingImportStatus(null);
      return;
    }

    setIsImportingMeetingNotes(true);
    setMeetingImportStatus(null);
    setMeetingImportError(null);

    try {
      const doc = await getFeishuDocRawContentFromLink(
        trimmedUrl,
        feishuUserAccessToken || undefined,
        feishuAppId || undefined,
        feishuAppSecret || undefined
      );
      updateCandidate(position.id, candidate.id, {
        meetingNotesContext: doc.content,
      });
      const extracted = await extractInterviewNotesInsights(candidate.questions, doc.content);
      if (!extracted) {
        throw new Error('从会议纪要提取问答失败。');
      }
      if (extracted.usage) {
        setMeetingNotesUsage(extracted.usage);
        updateCandidate(position.id, candidate.id, {
          aiUsage: {
            ...candidate.aiUsage,
            meetingNotesExtraction: extracted.usage,
          },
        });
      }

      const existingByNormalizedText = new Map<string, string>();
      candidate.questions.forEach((question) => {
        existingByNormalizedText.set(normalizeQuestionText(question.text), question.id);
      });

      const notesByQuestionId = new Map<string, string[]>();
      extracted.data.matchedAnswers.forEach((answer) => {
        const notes = buildImportedNotes(answer.answer, answer.evidence);
        notesByQuestionId.set(answer.questionId, [...(notesByQuestionId.get(answer.questionId) || []), notes]);
      });

      extracted.data.newQAs.forEach((qa) => {
        const normalized = normalizeQuestionText(qa.question);
        const existingQuestionId = existingByNormalizedText.get(normalized);
        if (existingQuestionId) {
          const notes = buildImportedNotes(qa.answer);
          notesByQuestionId.set(existingQuestionId, [...(notesByQuestionId.get(existingQuestionId) || []), notes]);
        }
      });

      let updatedExistingCount = 0;
      candidate.questions.forEach((question) => {
        const additions = notesByQuestionId.get(question.id);
        if (!additions?.length) {
          return;
        }

        const mergedNotes = [question.notes?.trim(), ...additions]
          .filter((value) => Boolean(value && value.trim()))
          .join('\n\n');

        updateQuestion(position.id, candidate.id, question.id, {
          notes: mergedNotes,
          status: 'asked',
        });
        updatedExistingCount += 1;
      });

      const existingNormalizedSet = new Set(candidate.questions.map((question) => normalizeQuestionText(question.text)));
      let addedNewCount = 0;
      extracted.data.newQAs.forEach((qa) => {
        const normalized = normalizeQuestionText(qa.question);
        if (existingNormalizedSet.has(normalized)) {
          return;
        }

        addQuestion(position.id, candidate.id, {
          text: qa.question,
          source: qa.source,
          evaluationDimension: qa.evaluationDimension,
          context: '',
          isAIGenerated: true,
          notes: buildImportedNotes(qa.answer),
          status: 'asked',
          category: qa.source,
        });
        existingNormalizedSet.add(normalized);
        addedNewCount += 1;
      });

      if (!updatedExistingCount && !addedNewCount) {
        setMeetingImportStatus(`未在“${doc.title}”中识别到可导入的问答。`);
      } else {
        setMeetingImportStatus(`已从“${doc.title}”导入：更新${updatedExistingCount}个已有问题，新增${addedNewCount}个问题。`);
      }
    } catch (error) {
      setMeetingImportError(error instanceof Error ? error.message : '导入会议纪要失败。');
    } finally {
      setIsImportingMeetingNotes(false);
    }
  };

  const handlePdfTextSelect = (text: string) => {
    if (!activeQuestionId || !text.trim()) return;

    const question = candidate.questions.find((q) => q.id === activeQuestionId);
    if (question) {
      const currentNotes = question.notes || '';
      const quotedText = `\n> "${text.trim()}"\n`;
      updateQuestion(position.id, candidate.id, activeQuestionId, {
        notes: currentNotes + quotedText,
      });
    }
  };

  const preferredResumeText = getPreferredResumeText(candidate);
  const isMissingResume = !preferredResumeText;
  const canGenerateQuestions = position.description && preferredResumeText;
  const hasInterviewLink = Boolean(candidate.interviewLink);
  const missingRequirements = [
    !position.description ? '岗位描述' : null,
    !preferredResumeText ? '候选人简历' : null,
  ].filter(Boolean) as string[];
  const generateQuestionsHint = missingRequirements.length
    ? `请先补充${missingRequirements.join('和')}，再使用 AI 生成问题。`
    : null;
  const isMeetingImportBusy = isImportingMeetingNotes || aiLoading;
  const shouldShowMeetingPermissionHint = isFeishuPermissionError(meetingImportError);

  const renderMeetingNotesImporter = () => (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">会议纪要导入</h3>
        <p className="text-xs text-gray-500">
          粘贴飞书会议纪要链接，可补全已有问题回答，并把纪要里出现的新角度或补充追问沉淀为新问题，再生成面试总结。
        </p>
      </CardHeader>
      <CardBody className="space-y-2">
        <Input
          placeholder="https://xxx.feishu.cn/docx/... 或 /wiki/..."
          value={meetingNotesUrl}
          onChange={(event) => setMeetingNotesUrl(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleExtractFromMeetingNotes}
            isLoading={isMeetingImportBusy}
            disabled={!meetingNotesUrl.trim() || isMeetingImportBusy}
          >
            从纪要提取问答
          </Button>
        </div>
        {meetingImportStatus && <p className="text-xs text-green-700">{meetingImportStatus}</p>}
        {meetingImportError && <p className="text-xs text-red-600">{meetingImportError}</p>}
        {shouldShowMeetingPermissionHint && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">当前纪要权限不足，可按以下方式处理：</p>
            <p>1. 在飞书文档中点击“创建副本”（这样你可以调整副本的分享权限）。</p>
            <p>2. 在“分享”按钮下，将“链接分享”从“未分享”改为“你的企业”。</p>
            <p>3. 将副本链接粘贴回面试页面后，再次点击“从纪要提取问答”。</p>
          </div>
        )}
      </CardBody>
    </Card>
  );

  if (showPdfViewerProp && pdfData) {
    return (
      <div ref={containerRef} className="flex h-[calc(100vh-120px)] w-full">
        <div
          style={{ width: `${interviewSplitRatio * 100}%` }}
          className="relative min-w-[300px] bg-white"
        >
          <div className="border-b bg-gray-50 px-3 py-2">
            <div className="flex items-stretch gap-2">
              {hasInterviewLink && (
                <div className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <p className="text-xs font-medium text-gray-700">面试链接</p>
                  {candidate.interviewLink && (
                    <a
                      href={candidate.interviewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-xs text-blue-600 hover:text-blue-800"
                    >
                      {candidate.interviewLink}
                    </a>
                  )}
                </div>
              )}
              <button
                type="button"
                ref={snapshotButtonRef}
                onClick={() => setIsSnapshotOpen((open) => !open)}
                className="flex flex-1 items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">候选人快照</p>
                  <p className="text-xs text-gray-500">
                    {isSnapshotOpen ? '收起亮点与摘要' : '展开亮点与摘要'}
                  </p>
                </div>
                <span className={`text-xs text-gray-400 transition-transform ${isSnapshotOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
            </div>
          </div>

          <PDFViewer
            pdfData={pdfData}
            filename={pdfFilename}
            onPageSelect={handlePdfTextSelect}
          />
          <div className="pointer-events-none absolute left-3 top-[60px] z-10 max-w-[min(360px,calc(100%-24px))]">
            <div
              className={`pointer-events-auto transition-all duration-200 ${
                isSnapshotOpen
                  ? 'translate-x-0 opacity-100'
                  : '-translate-x-3 opacity-0'
              }`}
            >
              {isSnapshotOpen && (
                <div
                  ref={snapshotPanelRef}
                  className="w-[320px] max-w-full space-y-2 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-lg backdrop-blur"
                >
                  <ResumeHighlightsPanel
                    highlights={candidate.resumeHighlights}
                    title="候选人快照"
                    emptyText="暂无提取亮点。"
                    compact
                  />
                  <HistoricalInterviewReviewsPanel
                    reviews={candidate.historicalInterviewReviews}
                    title="历史面评"
                    emptyText="暂无历史面评。"
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
            isDragging ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
          }`}
          onMouseDown={handleMouseDown}
        />

        <div
          style={{ width: `${(1 - interviewSplitRatio) * 100}%` }}
          className="min-w-[300px] overflow-auto"
        >
          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-gray-900">{candidate.name}</h2>
                <p className="text-xs text-gray-500">{position.title}</p>
              </div>
              {isMissingResume && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/positions/${position.id}/candidates/${candidate.id}/edit`)}
                >
                  {t.app.editCandidate}
                </Button>
              )}
            </div>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-medium text-gray-700">快速记录</h3>
              </CardHeader>
              <CardBody>
                <Textarea
                  placeholder="记录面试中的即时观察..."
                  value={quickNotesDraft}
                  onChange={(e) => handleQuickNotesChange(e.target.value)}
                  autoResize
                  className="text-sm"
                />
              </CardBody>
            </Card>

            {renderMeetingNotesImporter()}

            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleGenerateQuestions}
                  isLoading={aiLoading}
                  disabled={!canGenerateQuestions || aiLoading}
                  title={generateQuestionsHint || ''}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  生成面试问题
                </Button>
                <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
              </div>
              {generateQuestionsHint && (
                <p className="text-xs text-amber-700">{generateQuestionsHint}</p>
              )}
              {renderUsage(questionGenerationUsage, 'AI 问题生成 Token')}
              {renderUsage(meetingNotesUsage, 'AI 纪要提取 Token')}
            </div>

            <QuestionList
              positionId={position.id}
              candidateId={candidate.id}
              questions={candidate.questions}
              onQuestionClick={setActiveQuestionId}
              activeQuestionId={activeQuestionId}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-gray-900">{candidate.name}</h2>
          <p className="text-xs text-gray-500">{position.title}</p>
        </div>
        {isMissingResume && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/positions/${position.id}/candidates/${candidate.id}/edit`)}
          >
            {t.app.editCandidate}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">上下文</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">岗位描述</p>
            {position.description ? (
              <p className="text-xs text-gray-700 line-clamp-3">{position.description}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">尚未填写岗位描述</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">简历摘要</p>
            {preferredResumeText ? (
              <p className="text-xs text-gray-700 line-clamp-3">{preferredResumeText}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">尚未上传简历</p>
            )}
          </div>
        </CardBody>
      </Card>

      <ResumeHighlightsPanel
        highlights={candidate.resumeHighlights}
        title="候选人快照"
        emptyText="暂无提取亮点。"
        collapsible
        defaultExpanded={false}
        compact
      />

      <HistoricalInterviewReviewsPanel
        reviews={candidate.historicalInterviewReviews}
        title="历史面评"
        emptyText="暂无历史面评。"
        collapsible
        defaultExpanded={false}
        compact
      />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">快速记录</h3>
          <p className="text-xs text-gray-500">面试过程中的自由记录（会纳入总结）</p>
        </CardHeader>
        <CardBody>
          <Textarea
            placeholder="记录面试观察、印象或待跟进点..."
            value={quickNotesDraft}
            onChange={(e) => handleQuickNotesChange(e.target.value)}
            autoResize
            className="text-sm"
          />
        </CardBody>
      </Card>

      {renderMeetingNotesImporter()}

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleGenerateQuestions}
            isLoading={aiLoading}
            disabled={!canGenerateQuestions || aiLoading}
            title={generateQuestionsHint || ''}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI 生成问题
          </Button>
          <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
        </div>
        {generateQuestionsHint && (
          <p className="text-sm text-amber-700">{generateQuestionsHint}</p>
        )}
        {renderUsage(questionGenerationUsage, 'AI 问题生成 Token')}
        {renderUsage(meetingNotesUsage, 'AI 纪要提取 Token')}
      </div>

      <QuestionList
        positionId={position.id}
        candidateId={candidate.id}
        questions={candidate.questions}
      />
    </div>
  );
};
