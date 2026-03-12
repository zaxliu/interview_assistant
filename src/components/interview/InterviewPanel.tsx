import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Position, Candidate } from '@/types';
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
import { getFeishuDocRawContentFromLink } from '@/api/feishu';

interface InterviewPanelProps {
  position: Position;
  candidate: Candidate;
  showPdfViewer?: boolean;
}

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

  // PDF Viewer state - visibility controlled by parent via prop
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
  const containerRef = useRef<HTMLDivElement>(null);
  const quickNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get split ratio from settings store
  const {
    interviewSplitRatio,
    setInterviewSplitRatio,
    feishuUserAccessToken,
    feishuAppId,
    feishuAppSecret,
  } = useSettingsStore();
  const setHasPdf = useInterviewUIStore((state) => state.setHasPdf);

  // Load PDF from IndexedDB on mount
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
    setMeetingNotesUrl(candidate.interviewLink || '');
    setMeetingImportStatus(null);
    setMeetingImportError(null);
  }, [candidate.id, candidate.interviewLink]);

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

  // Drag handlers for resizable divider
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
      // Clamp between 20% and 80%
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
      alert('Please add job description and candidate resume first');
      return;
    }

    const questions = await generateInterviewQuestions(
      position.description,
      resumeContent,
      position.criteria
    );

    if (questions.length > 0) {
      setQuestions(position.id, candidate.id, questions);
    }
  };

  const handleQuickNotesChange = (quickNotes: string) => {
    setQuickNotesDraft(quickNotes);
  };

  const normalizeQuestionText = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

  const buildImportedNotes = (answer: string, evidence?: string): string => {
    const lines = [`[Imported from meeting notes] ${answer.trim()}`];
    if (evidence?.trim()) {
      lines.push(`Evidence: ${evidence.trim()}`);
    }
    return lines.join('\n');
  };

  const handleExtractFromMeetingNotes = async () => {
    const trimmedUrl = meetingNotesUrl.trim();
    if (!trimmedUrl) {
      setMeetingImportError('Please enter a Feishu meeting notes link.');
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
      const extracted = await extractInterviewNotesInsights(candidate.questions, doc.content);
      if (!extracted) {
        throw new Error('Failed to extract Q&A from meeting notes.');
      }

      const existingByNormalizedText = new Map<string, string>();
      candidate.questions.forEach((question) => {
        existingByNormalizedText.set(normalizeQuestionText(question.text), question.id);
      });

      const notesByQuestionId = new Map<string, string[]>();
      extracted.matchedAnswers.forEach((answer) => {
        const notes = buildImportedNotes(answer.answer, answer.evidence);
        notesByQuestionId.set(answer.questionId, [...(notesByQuestionId.get(answer.questionId) || []), notes]);
      });

      extracted.newQAs.forEach((qa) => {
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
      extracted.newQAs.forEach((qa) => {
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
        setMeetingImportStatus(`No actionable Q&A found in "${doc.title}".`);
      } else {
        setMeetingImportStatus(
          `Imported from "${doc.title}": updated ${updatedExistingCount} existing question(s), added ${addedNewCount} new Q&A item(s).`
        );
      }
    } catch (error) {
      setMeetingImportError(error instanceof Error ? error.message : 'Failed to import meeting notes.');
    } finally {
      setIsImportingMeetingNotes(false);
    }
  };

  const handlePdfTextSelect = (text: string) => {
    if (!activeQuestionId || !text.trim()) return;

    // Add quoted text to the active question's notes
    const question = candidate.questions.find(q => q.id === activeQuestionId);
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
    !position.description ? 'position description' : null,
    !preferredResumeText ? 'candidate resume' : null,
  ].filter(Boolean) as string[];
  const generateQuestionsHint = missingRequirements.length
    ? `Add ${missingRequirements.join(' and ')} to enable AI question generation.`
    : null;
  const isMeetingImportBusy = isImportingMeetingNotes || aiLoading;

  const renderMeetingNotesImporter = () => (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">Meeting Notes Import</h3>
        <p className="text-xs text-gray-500">
          Paste a Feishu meeting notes link to enrich existing answers and add new Q&A before generating summary.
        </p>
      </CardHeader>
      <CardBody className="space-y-2">
        <Input
          placeholder="https://xxx.feishu.cn/docx/... or /wiki/..."
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
            Extract Q&A from Notes
          </Button>
        </div>
        {meetingImportStatus && <p className="text-xs text-green-700">{meetingImportStatus}</p>}
        {meetingImportError && <p className="text-xs text-red-600">{meetingImportError}</p>}
      </CardBody>
    </Card>
  );

  // Layout with side panel for PDF viewer
  if (showPdfViewerProp && pdfData) {
    return (
      <div ref={containerRef} className="flex h-[calc(100vh-120px)] w-full">
          {/* PDF Viewer - Left side with dynamic width */}
          <div
            style={{ width: `${interviewSplitRatio * 100}%` }}
            className="relative min-w-[300px] bg-white"
          >
            <div className="border-b bg-gray-50 px-3 py-2">
              <div className="flex items-stretch gap-2">
                {hasInterviewLink && (
                  <div className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
                    <p className="text-xs font-medium text-gray-700">Meeting</p>
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
                  onClick={() => setIsSnapshotOpen((open) => !open)}
                  className="flex flex-1 items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">Candidate Snapshot</p>
                    <p className="text-xs text-gray-500">
                      {isSnapshotOpen ? 'Collapse highlights and summary' : 'Expand highlights and summary'}
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
                  <div className="w-[320px] max-w-full rounded-xl border border-gray-200 bg-white/95 p-1 shadow-lg backdrop-blur">
                    <ResumeHighlightsPanel
                      highlights={candidate.resumeHighlights}
                      title="Candidate Snapshot"
                      emptyText="No extracted highlights yet."
                      compact
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Draggable Divider */}
          <div
            className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
              isDragging ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
            }`}
            onMouseDown={handleMouseDown}
          />

          {/* Questions - Right side with remaining width */}
          <div
            style={{ width: `${(1 - interviewSplitRatio) * 100}%` }}
            className="min-w-[300px] overflow-auto"
          >
            <div className="space-y-4 p-4">
              {/* Header */}
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
                    Edit Candidate
                  </Button>
                )}
              </div>

              {/* Quick Notes */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-medium text-gray-700">Quick Notes</h3>
                </CardHeader>
                <CardBody>
                  <Textarea
                    placeholder="Jot down quick observations..."
                    value={quickNotesDraft}
                    onChange={(e) => handleQuickNotesChange(e.target.value)}
                    autoResize
                    className="text-sm"
                  />
                </CardBody>
              </Card>

              {renderMeetingNotesImporter()}

              {/* Question Generation */}
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
                    Generate Questions
                  </Button>
                  <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
                </div>
                {generateQuestionsHint && (
                  <p className="text-xs text-amber-700">{generateQuestionsHint}</p>
                )}
              </div>

              {/* Questions List */}
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

  // Normal layout without PDF viewer
  return (
    <div className="space-y-4">
      {/* Header - just info, buttons are in top banner */}
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
            Edit Candidate
          </Button>
        )}
      </div>

      {/* Job Description & Resume Summary */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Context</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Job Description</p>
            {position.description ? (
              <p className="text-xs text-gray-700 line-clamp-3">{position.description}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">No job description added</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Resume Summary</p>
            {preferredResumeText ? (
              <p className="text-xs text-gray-700 line-clamp-3">{preferredResumeText}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">No resume uploaded</p>
            )}
          </div>
        </CardBody>
      </Card>

      <ResumeHighlightsPanel
        highlights={candidate.resumeHighlights}
        title="Candidate Snapshot"
        emptyText="No extracted highlights yet."
        collapsible
        defaultExpanded={false}
        compact
      />

      {/* Quick Notes */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Quick Notes</h3>
          <p className="text-xs text-gray-500">Free-form notes during the interview (included in summary)</p>
        </CardHeader>
        <CardBody>
          <Textarea
            placeholder="Jot down quick observations, impressions, or reminders during the interview..."
            value={quickNotesDraft}
            onChange={(e) => handleQuickNotesChange(e.target.value)}
            autoResize
            className="text-sm"
          />
        </CardBody>
      </Card>

      {renderMeetingNotesImporter()}

      {/* Question Generation */}
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
            Generate Questions from AI
          </Button>
          <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
        </div>
        {generateQuestionsHint && (
          <p className="text-sm text-amber-700">{generateQuestionsHint}</p>
        )}
      </div>

      {/* Questions List */}
      <QuestionList
        positionId={position.id}
        candidateId={candidate.id}
        questions={candidate.questions}
      />
    </div>
  );
};
