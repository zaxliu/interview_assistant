import React, { useState, useEffect } from 'react';
import type { Position, Candidate } from '@/types';
import { QuestionList } from './QuestionList';
import { AddQuestionForm } from './AddQuestionForm';
import { PDFViewer } from '@/components/ui/PDFViewer';
import { Card, CardHeader, CardBody, Button, Textarea } from '@/components/ui';
import { useAI } from '@/hooks/useAI';
import { usePositionStore } from '@/store/positionStore';
import { getPDF } from '@/utils/pdfStorage';

interface InterviewPanelProps {
  position: Position;
  candidate: Candidate;
  showPdfViewer?: boolean;  // Controlled by parent
  onLayoutChange?: (layout: { pdfData: ArrayBuffer | null }) => void;
}

export const InterviewPanel: React.FC<InterviewPanelProps> = ({
  position,
  candidate,
  showPdfViewer: showPdfViewerProp = true,
  onLayoutChange,
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

  // Report PDF data to parent when loaded
  useEffect(() => {
    onLayoutChange?.({ pdfData });
  }, [pdfData, onLayoutChange]);

  // Load PDF from IndexedDB on mount
  useEffect(() => {
    const loadPdf = async () => {
      try {
        console.log('[InterviewPanel] Loading PDF for candidate:', candidate.id, 'name:', candidate.name);
        console.log('[InterviewPanel] Candidate resumeFilename:', candidate.resumeFilename);
        const pdf = await getPDF(candidate.id);
        console.log('[InterviewPanel] PDF loaded:', pdf ? `found, size: ${pdf.data.byteLength}` : 'not found');
        if (pdf) {
          setPdfData(pdf.data);
          setPdfFilename(pdf.filename);
          console.log('[InterviewPanel] PDF state updated');
        }
      } catch (error) {
        console.error('[InterviewPanel] Failed to load PDF:', error);
      }
    };
    loadPdf();
  }, [candidate.id, candidate.name, candidate.resumeFilename]);

  const handleGenerateQuestions = async () => {
    if (!position.description || !candidate.resumeText) {
      alert('Please add job description and candidate resume first');
      return;
    }

    const questions = await generateInterviewQuestions(
      position.description,
      candidate.resumeText,
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

  const canGenerateQuestions = position.description && candidate.resumeText;

  // Layout with side panel for PDF viewer
  if (showPdfViewerProp && pdfData) {
    return (
      <div className="flex gap-4 h-[calc(100vh-120px)] w-full">
          {/* PDF Viewer - Left side */}
          <div className="flex-1 min-w-[500px] max-w-[700px] shrink-0 border-r bg-white">
            <PDFViewer
              pdfData={pdfData}
              filename={pdfFilename}
              onPageSelect={handlePdfTextSelect}
            />
          </div>

          {/* Questions - Right side */}
          <div className="flex-1 min-w-[400px] max-w-[600px] shrink-0 overflow-auto">
            <div className="space-y-4">
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

              {/* Question Generation */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleGenerateQuestions}
                  isLoading={aiLoading}
                  disabled={!canGenerateQuestions || aiLoading}
                  title={!canGenerateQuestions ? 'Add job description and resume first' : ''}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Questions
                </Button>
                <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
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
            {candidate.resumeText ? (
              <p className="text-xs text-gray-700 line-clamp-3">{candidate.resumeText}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">No resume uploaded</p>
            )}
          </div>
        </CardBody>
      </Card>

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
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={handleGenerateQuestions}
          isLoading={aiLoading}
          disabled={!canGenerateQuestions || aiLoading}
          title={!canGenerateQuestions ? 'Add job description and resume first' : ''}
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate Questions from AI
        </Button>
        <AddQuestionForm positionId={position.id} candidateId={candidate.id} />
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
