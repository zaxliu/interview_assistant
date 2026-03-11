import React from 'react';
import type { ResumeHighlights } from '@/types';
import { Card, CardBody, CardHeader } from '@/components/ui';

interface ResumeHighlightsPanelProps {
  highlights?: ResumeHighlights;
  title?: string;
  emptyText?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  compact?: boolean;
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
  collapsible = false,
  defaultExpanded = true,
  compact = false,
}) => {
  const hasContent =
    Boolean(highlights?.summary) ||
    Boolean(highlights?.strengths.length) ||
    Boolean(highlights?.risks.length) ||
    Boolean(highlights?.experience.length) ||
    Boolean(highlights?.keywords.length);

  const content = !hasContent ? (
    <p className="text-xs text-gray-400 italic">{emptyText}</p>
  ) : (
    <>
      {highlights?.summary && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Summary</p>
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-700`}>{highlights.summary}</p>
        </div>
      )}
      {highlightGroups(highlights || { summary: '', strengths: [], risks: [], experience: [], keywords: [] })
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium text-gray-600 mb-1">{group.label}</p>
            <ul className={`${compact ? 'text-xs space-y-0.5' : 'text-sm space-y-1'} text-gray-700 list-disc list-inside`}>
              {group.items.map((item) => (
                <li key={`${group.label}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
    </>
  );

  return (
    <Card>
      <CardHeader>
        {collapsible ? (
          <details className="group" open={defaultExpanded}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-700">
              <span>{title}</span>
              <span className="text-xs text-gray-400 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <CardBody className="space-y-3 px-0 pt-3 pb-0">
              {content}
            </CardBody>
          </details>
        ) : (
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        )}
      </CardHeader>
      {!collapsible && <CardBody className="space-y-3">{content}</CardBody>}
    </Card>
  );
};
