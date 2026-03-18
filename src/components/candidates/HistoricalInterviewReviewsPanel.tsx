import React from 'react';
import type { HistoricalInterviewReview } from '@/types';
import { Card, CardBody, CardHeader } from '@/components/ui';

interface HistoricalInterviewReviewsPanelProps {
  reviews?: HistoricalInterviewReview[];
  title?: string;
  emptyText?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  compact?: boolean;
}

const formatMeta = (review: HistoricalInterviewReview): string => {
  return [
    review.stageName,
    review.interviewer ? `面试官：${review.interviewer}` : null,
    review.interviewTime,
    review.result ? `结果：${review.result}` : null,
  ].filter(Boolean).join(' · ');
};

export const HistoricalInterviewReviewsPanel: React.FC<HistoricalInterviewReviewsPanelProps> = ({
  reviews,
  title = '历史面评',
  emptyText = '暂无历史面评。',
  collapsible = true,
  defaultExpanded = false,
  compact = false,
}) => {
  const validReviews = (reviews || []).filter((item) => item.summary?.trim());

  const content = validReviews.length === 0 ? (
    <p className="text-xs text-gray-400 italic">{emptyText}</p>
  ) : (
    <div className="space-y-3">
      {validReviews.map((review, index) => (
        <div key={review.id || `${review.stageName || 'review'}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-900">
            {review.stageName || `历史面评 ${index + 1}`}
          </p>
          {formatMeta(review) && (
            <p className="mt-1 text-[11px] text-amber-700">{formatMeta(review)}</p>
          )}
          <p className={`mt-2 whitespace-pre-wrap text-gray-700 ${compact ? 'text-xs' : 'text-sm'}`}>
            {review.summary}
          </p>
        </div>
      ))}
    </div>
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
