import React from 'react';
import type { ResumeHighlights } from '@/types';
import { Card, CardBody, CardHeader } from '@/components/ui';

interface ResumeHighlightsPanelProps {
  highlights?: ResumeHighlights;
  title?: string;
  emptyText?: string;
}

const highlightGroups = (
  highlights: ResumeHighlights
): Array<{ label: string; items: string[] }> => [
  { label: 'Strengths', items: highlights.strengths },
  { label: 'Risks', items: highlights.risks },
  { label: 'Experience', items: highlights.experience },
  { label: 'Keywords', items: highlights.keywords },
];

export const ResumeHighlightsPanel: React.FC<ResumeHighlightsPanelProps> = ({
  highlights,
  title = 'Resume Highlights',
  emptyText = 'No resume highlights yet.',
}) => {
  const hasContent =
    Boolean(highlights?.summary) ||
    Boolean(highlights?.strengths.length) ||
    Boolean(highlights?.risks.length) ||
    Boolean(highlights?.experience.length) ||
    Boolean(highlights?.keywords.length);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
      </CardHeader>
      <CardBody className="space-y-3">
        {!hasContent ? (
          <p className="text-xs text-gray-400 italic">{emptyText}</p>
        ) : (
          <>
            {highlights?.summary && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Summary</p>
                <p className="text-sm text-gray-700">{highlights.summary}</p>
              </div>
            )}
            {highlightGroups(highlights || { summary: '', strengths: [], risks: [], experience: [], keywords: [] })
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-medium text-gray-600 mb-1">{group.label}</p>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                    {group.items.map((item) => (
                      <li key={`${group.label}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </>
        )}
      </CardBody>
    </Card>
  );
};
