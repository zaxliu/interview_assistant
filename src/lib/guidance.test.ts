import { describe, expect, it } from 'vitest';
import type { FeedbackEvent } from '@/types';
import { synthesizeGenerationGuidance } from './guidance';

const event = (partial: Partial<FeedbackEvent>): FeedbackEvent => ({
  id: partial.id || 'e-1',
  type: partial.type || 'question_asked',
  createdAt: partial.createdAt || '2026-04-04T00:00:00.000Z',
  candidateId: partial.candidateId || 'c-1',
  questionId: partial.questionId,
  details: partial.details,
});

describe('synthesizeGenerationGuidance', () => {
  it('builds question and summary guidance from feedback events', () => {
    const guidance = synthesizeGenerationGuidance([
      event({
        id: '1',
        type: 'question_asked',
        details: { source: 'resume', evaluationDimension: '专业能力' },
      }),
      event({
        id: '2',
        type: 'question_edited',
        details: { editPattern: '缩短题干' },
      }),
      event({
        id: '3',
        type: 'summary_rewritten',
        details: { preference: '减少空泛结论', rewriteIntensity: 'medium' },
      }),
    ]);

    expect(guidance.questionGuidance).toContain('优先覆盖维度');
    expect(guidance.questionGuidance).toContain('专业能力');
    expect(guidance.summaryGuidance).toContain('面评常见改写偏好');
    expect(guidance.summaryGuidance).toContain('减少空泛结论');
  });

  it('falls back to default guidance when no events', () => {
    const guidance = synthesizeGenerationGuidance([]);

    expect(guidance.questionGuidance).toContain('暂无足够反馈');
    expect(guidance.summaryGuidance).toContain('暂无足够反馈');
    expect(guidance.sampleSize).toBe(0);
  });

  it('filters out empty keys from aggregation', () => {
    const guidance = synthesizeGenerationGuidance([
      event({
        id: '1',
        type: 'question_asked',
        details: { source: 'resume', evaluationDimension: '' },
      }),
      event({
        id: '2',
        type: 'question_asked',
        details: { source: '', evaluationDimension: '适配度' },
      }),
    ]);

    // '适配度' should appear, empty dimension should not produce a count entry
    expect(guidance.questionGuidance).toContain('适配度');
    // 'resume' should appear, empty source should not
    expect(guidance.questionGuidance).toContain('resume');
  });

  it('handles v2 summary_rewritten event with preferences array', () => {
    const guidance = synthesizeGenerationGuidance([
      event({
        id: '1',
        type: 'summary_rewritten',
        details: {
          preferences: ['加强证据', '减少主观判断', '明确结论'],
          rewriteIntensity: 'high',
        },
      }),
    ]);

    expect(guidance.summaryGuidance).toContain('加强证据');
    expect(guidance.summaryGuidance).toContain('减少主观判断');
    expect(guidance.summaryGuidance).toContain('明确结论');
    expect(guidance.summaryGuidance).toContain('high');
  });

  it('handles mixed v1 and v2 summary_rewritten events', () => {
    const guidance = synthesizeGenerationGuidance([
      // v1 format
      event({
        id: '1',
        type: 'summary_rewritten',
        details: { preference: '加强证据', rewriteIntensity: 'medium' },
      }),
      // v2 format
      event({
        id: '2',
        type: 'summary_rewritten',
        candidateId: 'c-2',
        details: {
          preferences: ['加强证据', '精简篇幅'],
          rewriteIntensity: 'high',
        },
      }),
    ]);

    expect(guidance.summaryGuidance).toContain('加强证据（2）');
    expect(guidance.summaryGuidance).toContain('精简篇幅');
  });

  it('selects the 20 most recent candidates by latest event time', () => {
    // Create 25 candidates, each with one event
    const events: FeedbackEvent[] = [];
    for (let i = 1; i <= 25; i++) {
      events.push(
        event({
          id: `e-${i}`,
          type: 'question_asked',
          candidateId: `c-${i}`,
          createdAt: `2026-04-${String(i).padStart(2, '0')}T00:00:00.000Z`,
          details: { source: 'resume', evaluationDimension: `dim-${i}` },
        })
      );
    }

    const guidance = synthesizeGenerationGuidance(events);

    // Only the 20 most recent candidates should be included (c-6 through c-25)
    expect(guidance.sampleSize).toBe(20);
    // c-1 through c-5 should be excluded
    expect(guidance.questionGuidance).not.toContain('dim-1（');
    expect(guidance.questionGuidance).not.toContain('dim-5（');
    // c-6 should be included (oldest of the 20 kept)
    expect(guidance.questionGuidance).toContain('dim-6');
  });

  it('counts rewrite intensity once per event, not once per preference', () => {
    const guidance = synthesizeGenerationGuidance([
      // One event with 4 preferences, all 'high' intensity
      event({
        id: '1',
        type: 'summary_rewritten',
        details: {
          preferences: ['偏好A', '偏好B', '偏好C', '偏好D'],
          rewriteIntensity: 'high',
        },
      }),
      // One event with 1 preference, 'low' intensity
      event({
        id: '2',
        type: 'summary_rewritten',
        candidateId: 'c-2',
        details: {
          preferences: ['偏好E'],
          rewriteIntensity: 'low',
        },
      }),
    ]);

    // Intensity should be counted per event: high(1), low(1) — NOT high(4), low(1)
    expect(guidance.summaryGuidance).toContain('high（1）');
    expect(guidance.summaryGuidance).toContain('low（1）');
    // Preferences should still be counted per entry
    expect(guidance.summaryGuidance).toContain('偏好A（1）');
  });
});
