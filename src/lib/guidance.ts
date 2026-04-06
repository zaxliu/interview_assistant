import type { FeedbackEvent, GenerationGuidance } from '@/types';

const QUESTION_GUIDANCE_LIMIT = 6;
const SUMMARY_GUIDANCE_LIMIT = 6;
const RECENT_CANDIDATE_LIMIT = 20;

const truncate = (text: string, maxChars: number): string => (
  text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
);

const countBy = <T>(items: T[], keyBuilder: (item: T) => string): Array<{ key: string; count: number }> => {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = keyBuilder(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
};

const toList = (title: string, rows: Array<{ key: string; count: number }>, limit: number): string => {
  if (!rows.length) return '';
  const body = rows
    .slice(0, limit)
    .map((row) => `- ${row.key}（${row.count}）`)
    .join('\n');
  return `${title}\n${body}`;
};

/**
 * Select the most recent N unique candidate IDs based on their latest event time.
 */
const selectRecentCandidateIds = (events: FeedbackEvent[], limit: number): Set<string> => {
  const latestByCandidate = new Map<string, string>();
  events.forEach((event) => {
    if (!event.candidateId) return;
    const existing = latestByCandidate.get(event.candidateId);
    if (!existing || (event.createdAt || '') > existing) {
      latestByCandidate.set(event.candidateId, event.createdAt || '');
    }
  });
  const sorted = Array.from(latestByCandidate.entries())
    .sort(([, a], [, b]) => a.localeCompare(b));
  const recentIds = sorted.slice(-limit).map(([id]) => id);
  return new Set(recentIds);
};

/**
 * Expand a single summary_rewritten event's preferences array into
 * individual { preference, rewriteIntensity } entries for counting.
 * Supports both v1 format (details.preference as string) and
 * v2 format (details.preferences as string[]).
 */
const extractSummaryPreferences = (event: FeedbackEvent): Array<{ preference: string; rewriteIntensity: string }> => {
  const details = event.details;
  if (!details) return [];
  const intensity = String(details.rewriteIntensity || '');

  // v2 format: preferences is string[]
  if (Array.isArray(details.preferences)) {
    return (details.preferences as string[])
      .filter((p) => typeof p === 'string' && p)
      .map((preference) => ({ preference, rewriteIntensity: intensity }));
  }

  // v1 format: preference is a single string
  if (typeof details.preference === 'string' && details.preference) {
    return [{ preference: details.preference, rewriteIntensity: intensity }];
  }

  return [];
};

export const synthesizeGenerationGuidance = (
  events: FeedbackEvent[],
  nowIso: string = new Date().toISOString(),
  maxChars: number = 1200
): GenerationGuidance => {
  // Step 1: Select the most recent N candidates by their latest event time
  const candidateSet = selectRecentCandidateIds(events, RECENT_CANDIDATE_LIMIT);

  // Step 2: Filter all events belonging to those candidates
  const scopedEvents = events.filter((event) => candidateSet.has(event.candidateId));

  // Question guidance aggregation — filter empty keys via keyBuilder returning ''
  const askedByDimension = countBy(
    scopedEvents.filter((event) => event.type === 'question_asked'),
    (event) => String(event.details?.evaluationDimension || '')
  );
  const askedBySource = countBy(
    scopedEvents.filter((event) => event.type === 'question_asked'),
    (event) => String(event.details?.source || '')
  );
  const editedQuestionPatterns = countBy(
    scopedEvents.filter((event) => event.type === 'question_edited'),
    (event) => String(event.details?.editPattern || '')
  );

  // Summary guidance aggregation
  const summaryRewriteEvents = scopedEvents.filter((event) => event.type === 'summary_rewritten');
  // Preferences: flatten per-event arrays for frequency counting
  const allPreferences = summaryRewriteEvents.flatMap(extractSummaryPreferences);
  const summaryPatterns = countBy(allPreferences, (entry) => entry.preference);
  // Intensity: count once per event (not per preference) to avoid bias
  const summaryIntensity = countBy(
    summaryRewriteEvents,
    (event) => String(event.details?.rewriteIntensity || '')
  );

  const questionSections = [
    toList('优先覆盖维度', askedByDimension, QUESTION_GUIDANCE_LIMIT),
    toList('高采纳来源', askedBySource, QUESTION_GUIDANCE_LIMIT),
    toList('常见问题改写偏好', editedQuestionPatterns, QUESTION_GUIDANCE_LIMIT),
  ].filter(Boolean);
  const summarySections = [
    toList('面评常见改写偏好', summaryPatterns, SUMMARY_GUIDANCE_LIMIT),
    toList('面评改写幅度分布', summaryIntensity, SUMMARY_GUIDANCE_LIMIT),
  ].filter(Boolean);

  const questionGuidance = truncate(
    questionSections.length
      ? `【岗位历史反馈指引-问题】\n${questionSections.join('\n\n')}`
      : '【岗位历史反馈指引-问题】暂无足够反馈，优先覆盖专业能力、通用素质、适配度并控制问题去重。',
    maxChars
  );
  const summaryGuidance = truncate(
    summarySections.length
      ? `【岗位历史反馈指引-面评】\n${summarySections.join('\n\n')}`
      : '【岗位历史反馈指引-面评】暂无足够反馈，重点输出可验证证据、核心优势与风险、明确录用结论。',
    maxChars
  );

  return {
    questionGuidance,
    summaryGuidance,
    updatedAt: nowIso,
    sampleSize: candidateSet.size,
  };
};
