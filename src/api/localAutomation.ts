import type { Candidate } from '@/types';

interface TriggerResumeUploadParams {
  serviceUrl: string;
  candidate: Candidate;
  positionTitle: string;
  pdfFilename: string;
  pdfData: ArrayBuffer;
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

export const triggerResumeUpload = async ({
  serviceUrl,
  candidate,
  positionTitle,
  pdfFilename,
  pdfData,
}: TriggerResumeUploadParams): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/upload-resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidateId: candidate.id,
      candidateName: candidate.name,
      positionTitle,
      targetLink: candidate.candidateLink || candidate.interviewLink,
      interviewLink: candidate.interviewLink,
      candidateLink: candidate.candidateLink,
      pdfFilename,
      pdfBase64: arrayBufferToBase64(pdfData),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Automation service error: ${response.status}`);
  }

  return response.json();
};
