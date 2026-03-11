import React, { useState, useEffect, useRef } from 'react';
import type { Position, Candidate } from '@/types';
import { QuestionList } from './QuestionList';
import { AddQuestionForm } from './AddQuestionForm';
import { PDFViewer } from '@/components/ui/PDFViewer';
import { Card, CardHeader, CardBody, Button, Textarea } from '@/components/ui';
import { useAI } from '@/hooks/useAI';
import { usePositionStore } from '@/store/positionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewUIStore } from '@/store/interviewUIStore';
import { getPDF } from '@/utils/pdfStorage';
import { getPreferredResumeText } from '@/utils/resume';
import { ResumeHighlightsPanel } from '@/components/candidates/ResumeHighlightsPanel';

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
  const { isLoading: aiLoading, generateInterviewQuestions } = useAI();
  const {
    setQuestions,
    updateCandidate,
    updateQuestion,
  } = usePositionStore();

  // PDF Viewer state - visibility controlled by parent via prop
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get split ratio from settings store
  const { interviewSplitRatio, setInterviewSplitRatio } = useSettingsStore();
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
    updateCandidate(position.id, candidate.id, { quickNotes });
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
  const canGenerateQuestions = position.description && preferredResumeText;
  const hasCalendarLinks = Boolean(candidate.interviewLink || candidate.candidateLink);
  const missingRequirements = [
    !position.description ? 'position description' : null,
    !preferredResumeText ? 'candidate resume' : null,
  ].filter(Boolean) as string[];
  const generateQuestionsHint = missingRequirements.length
    ? `Add ${missingRequirements.join(' and ')} to enable AI question generation.`
    : null;

  // Layout with side panel for PDF viewer
  if (showPdfViewerProp && pdfData) {
    return (
      <div ref={containerRef} className="flex h-[calc(100vh-120px)] w-full">
          {/* PDF Viewer - Left side with dynamic width */}
          <div
            style={{ width: `${interviewSplitRatio * 100}%` }}
            className="min-w-[300px] bg-white"
          >
            <PDFViewer
              pdfData={pdfData}
              filename={pdfFilename}
              onPageSelect={handlePdfTextSelect}
            />
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
              <div>
                <h2 className="text-sm font-medium text-gray-900">{candidate.name}</h2>
                <p className="text-xs text-gray-500">{position.title}</p>
              </div>

              {/* Quick Notes */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-medium text-gray-700">Quick Notes</h3>
                </CardHeader>
                <CardBody>
                  <Textarea
                    placeholder="Jot down quick observations..."
                    value={candidate.quickNotes || ''}
                    onChange={(e) => handleQuickNotesChange(e.target.value)}
                    autoResize
                    className="text-sm"
                  />
                </CardBody>
              </Card>

              <ResumeHighlightsPanel
                highlights={candidate.resumeHighlights}
                title="Resume Highlights"
                emptyText="No extracted highlights yet."
              />

              {hasCalendarLinks && (
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium text-gray-700">Calendar Links</h3>
                  </CardHeader>
                  <CardBody className="space-y-2">
                    {candidate.interviewLink && (
                      <div className="text-sm">
                        <span className="text-gray-500">Video interview:</span>{' '}
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
                    {candidate.candidateLink && (
                      <div className="text-sm">
                        <span className="text-gray-500">Candidate profile:</span>{' '}
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
                  </CardBody>
                </Card>
              )}

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
      <div>
        <h2 className="text-sm font-medium text-gray-900">{candidate.name}</h2>
        <p className="text-xs text-gray-500">{position.title}</p>
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
        title="Resume Highlights"
        emptyText="No extracted highlights yet."
      />

      {hasCalendarLinks && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-medium text-gray-700">Calendar Links</h3>
          </CardHeader>
          <CardBody className="space-y-2">
            {candidate.interviewLink && (
              <div className="text-sm">
                <span className="text-gray-500">Video interview:</span>{' '}
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
            {candidate.candidateLink && (
              <div className="text-sm">
                <span className="text-gray-500">Candidate profile:</span>{' '}
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
          </CardBody>
        </Card>
      )}

      {/* Quick Notes */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-gray-700">Quick Notes</h3>
          <p className="text-xs text-gray-500">Free-form notes during the interview (included in summary)</p>
        </CardHeader>
        <CardBody>
          <Textarea
            placeholder="Jot down quick observations, impressions, or reminders during the interview..."
            value={candidate.quickNotes || ''}
            onChange={(e) => handleQuickNotesChange(e.target.value)}
            autoResize
            className="text-sm"
          />
        </CardBody>
      </Card>

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
