import React, { useState, useRef } from 'react';
import type { Candidate } from '@/types';
import { usePositionStore } from '@/store/positionStore';
import { usePDFParser } from '@/hooks/usePDFParser';
import { storePDF } from '@/utils/pdfStorage';
import { debugDownloadPDFPageAsImage } from '@/api/pdf';
import { Card, CardHeader, CardBody, CardFooter, Button, Input, Textarea } from '@/components/ui';

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
    parseFromFile,
    parseFromUrl,
    canUseAI,
  } = usePDFParser();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(candidate?.name || '');
  const [resumeUrl, setResumeUrl] = useState(candidate?.resumeUrl || '');
  const [resumeText, setResumeText] = useState(candidate?.resumeText || '');
  const [resumeFilename, setResumeFilename] = useState(candidate?.resumeFilename || '');
  const [interviewTime, setInterviewTime] = useState(() => {
    if (!candidate?.interviewTime) return '';
    const date = new Date(candidate.interviewTime);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  });
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [useAIParsing, setUseAIParsing] = useState(true);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file. If you have a ZIP file, extract it first to get the PDF.');
        return;
      }
      setResumeFilename(file.name);
      setPendingPdfFile(file); // Store for later IndexedDB save

      // Use AI parsing if enabled and available, otherwise standard
      const text = await parseFromFile(file, useAIParsing && canUseAI, { maxPages: 5 });
      if (text) {
        setResumeText(text);
      }
    }
  };

  const handleUrlParse = async () => {
    if (resumeUrl) {
      // Use AI parsing if enabled and available, otherwise standard
      const text = await parseFromUrl(resumeUrl, useAIParsing && canUseAI, { maxPages: 5 });
      if (text) {
        setResumeText(text);
      }
    }
  };

  const handleSubmit = async () => {
    const candidateData = {
      name,
      resumeUrl,
      resumeText,
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
      alert('Failed to save candidate. Please try again.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">
          {candidate ? 'Edit Candidate' : 'Add Candidate'}
        </h3>
      </CardHeader>
      <CardBody className="space-y-3">
        <Input
          label="Candidate Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />

        <Input
          label="Interview Time"
          type="datetime-local"
          value={interviewTime}
          onChange={(e) => setInterviewTime(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Resume
          </label>

          {/* Instructions */}
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
            <p className="font-medium mb-2">How to get resume from Wintalent:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click the "候选人链接" in the calendar event</li>
              <li>On Wintalent page, click "预览" next to the file</li>
              <li>Download the ZIP file and <strong>extract it</strong></li>
              <li>Upload the <strong>PDF file</strong> (not ZIP)</li>
            </ol>
          </div>

          {/* Error display */}
          {pdfError && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {pdfError}
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
                  <strong>AI-powered parsing</strong> - Better for scanned documents & complex layouts
                </span>
              </label>
              {useAIParsing && (
                <p className="text-xs text-purple-600 mt-1 ml-6">
                  Uses AI Vision to extract text. Limited to first 5 pages.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
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
                isLoading={pdfLoading}
              >
                {pdfLoading ? 'Parsing...' : 'Upload PDF'}
              </Button>
              {resumeFilename && (
                <span className="text-sm text-green-600 flex items-center">
                  ✓ {resumeFilename}
                </span>
              )}
              {/* Debug button - only show when PDF is loaded */}
              {pendingPdfFile && (
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
                  🐛 Download Page 1 as Image
                </Button>
              )}
            </div>

            {/* URL input */}
            <div className="flex gap-2">
              <Input
                type="url"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                placeholder="Or paste direct PDF URL (not Wintalent page)"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUrlParse}
                disabled={!resumeUrl || pdfLoading}
                isLoading={pdfLoading}
              >
                Parse
              </Button>
            </div>

            {/* Resume text preview */}
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">
                {resumeText ? 'Extracted text (editable):' : 'Resume text (upload PDF or paste manually):'}
              </p>
              <Textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={8}
                className="text-xs"
                placeholder="Resume content will appear here after PDF upload, or paste manually..."
              />
            </div>
          </div>
        </div>
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!name.trim()}>
          {candidate ? 'Save Changes' : 'Add Candidate'}
        </Button>
      </CardFooter>
    </Card>
  );
};
