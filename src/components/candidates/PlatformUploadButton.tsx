import React, { useMemo, useState } from 'react';
import type { Candidate } from '@/types';
import { Button } from '@/components/ui';
import { getPDF } from '@/utils/pdfStorage';
import { triggerResumeUpload } from '@/api/localAutomation';
import { useSettingsStore } from '@/store/settingsStore';

interface PlatformUploadButtonProps {
  candidate: Candidate;
  positionTitle: string;
}

export const PlatformUploadButton: React.FC<PlatformUploadButtonProps> = ({
  candidate,
  positionTitle,
}) => {
  const automationServiceUrl = useSettingsStore((state) => state.automationServiceUrl || 'http://127.0.0.1:3456');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);

  const canUpload = useMemo(
    () => Boolean(candidate.candidateLink || candidate.interviewLink),
    [candidate.candidateLink, candidate.interviewLink]
  );

  const handleUpload = async () => {
    setIsUploading(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const storedPdf = await getPDF(candidate.id);
      if (!storedPdf) {
        throw new Error('No stored PDF found for this candidate.');
      }

      const result = await triggerResumeUpload({
        serviceUrl: automationServiceUrl,
        candidate,
        positionTitle,
        pdfFilename: storedPdf.filename,
        pdfData: storedPdf.data,
      });

      setStatusMessage(result.message);
      setStatusType(result.success ? 'success' : 'error');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to trigger local upload.');
      setStatusType('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleUpload}
        disabled={!canUpload}
        isLoading={isUploading}
        title={canUpload ? 'Upload stored PDF to the external candidate platform' : 'No candidate or interview link available'}
      >
        Upload Resume to Platform
      </Button>
      {statusMessage && (
        <p className={`text-xs ${statusType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
};
