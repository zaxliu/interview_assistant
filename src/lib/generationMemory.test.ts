import { describe, expect, it } from 'vitest';
import type {
  FeedbackEvent,
  GenerationMemoryItem,
  GenerationMemoryState,
  MemoryRefreshScope,
  Position,
} from '@/types';
import {
  buildMemoryEvidencePackets,
  getGenerationGuidancePrompt,
  getInjectedGenerationGuidancePrompt,
  shouldRefreshGenerationMemory,
  synthesizeGenerationMemory,
} from './generationMemory';

const event = (partial: Partial<FeedbackEvent>): FeedbackEvent => ({
  id: partial.id || 'event-1',
  type: partial.type || 'question_asked',
  createdAt: partial.createdAt || '2026-04-06T08:00:00.000Z',
  candidateId: partial.candidateId || 'candidate-1',
  questionId: partial.questionId,
  details: partial.details,
});

const memoryItem = (
  partial: Partial<GenerationMemoryItem> & Pick<GenerationMemoryItem, 'scope' | 'instruction'>
): GenerationMemoryItem => ({
  id: partial.id || 'memory-1',
  scope: partial.scope,
  kind: partial.kind || 'prefer',
  instruction: partial.instruction,
  rationale: partial.rationale || '因为有稳定证据',
  evidenceCount: partial.evidenceCount || 2,
  confidence: partial.confidence || 0.8,
  lastSeenAt: partial.lastSeenAt || '2026-04-05T08:00:00.000Z',
});

const buildPosition = (
  scope: MemoryRefreshScope,
  state: Partial<GenerationMemoryState> = {}
): Position => ({
  id: 'position-1',
  title: 'Staff Engineer',
  criteria: [],
  createdAt: '2026-04-01T00:00:00.000Z',
  source: 'manual',
  candidates: [],
  feedbackEvents: [],
  generationMemoryState: {
    dirtyScopes: [scope],
    pendingQuestionEventCount: 0,
    pendingSummaryEventCount: 0,
    pendingQuestionCandidateCount: 0,
    pendingSummaryCandidateCount: 0,
    ...state,
  },
});

describe('generationMemory utilities', () => {
  it('builds evidence packets for question edit feedback with before and after context', () => {
    const packets = buildMemoryEvidencePackets(
      [
        event({
          type: 'question_edited',
          questionId: 'q-1',
          details: {
            source: 'resume',
            evaluationDimension: '专业能力',
            originalText: '请介绍项目',
            editedText: '请具体介绍你在推荐系统里的召回链路设计',
            editPattern: '更具体',
          },
        }),
      ],
      'question_generation'
    );

    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({
      scope: 'question_generation',
      eventType: 'question_edited',
      candidateId: 'candidate-1',
    });
    expect(packets[0].summary).toContain('更具体');
    expect(packets[0].payload).toMatchObject({
      originalText: '请介绍项目',
      editedText: '请具体介绍你在推荐系统里的召回链路设计',
    });
  });

  it('refreshes dirty memory during explicit generation even within cooldown', () => {
    const decision = shouldRefreshGenerationMemory(
      buildPosition('question_generation', {
        pendingQuestionEventCount: 1,
        lastQuestionRefreshAt: '2026-04-06T09:40:00.000Z',
      }),
      'question_generation',
      {
        trigger: 'generation',
        nowIso: '2026-04-06T10:00:00.000Z',
      }
    );

    expect(decision.shouldRefresh).toBe(true);
    expect(decision.reason).toBe('generation');
  });

  it('skips lazy refresh when dirty scope has not crossed thresholds and is inside cooldown', () => {
    const decision = shouldRefreshGenerationMemory(
      buildPosition('summary_generation', {
        pendingSummaryEventCount: 1,
        pendingSummaryCandidateCount: 1,
        lastSummaryRefreshAt: '2026-04-06T09:45:00.000Z',
      }),
      'summary_generation',
      {
        trigger: 'lazy',
        nowIso: '2026-04-06T10:00:00.000Z',
      }
    );

    expect(decision.shouldRefresh).toBe(false);
    expect(decision.reason).toBe('cooldown');
  });

  it('prefers structured memory guidance prompt over legacy guidance text', () => {
    const prompt = getGenerationGuidancePrompt(
      {
        ...buildPosition('question_generation'),
        generationGuidance: {
          questionGuidance: 'legacy question guidance',
          summaryGuidance: 'legacy summary guidance',
          updatedAt: '2026-04-05T00:00:00.000Z',
          sampleSize: 3,
        },
        generationMemory: {
          questionMemoryItems: [memoryItem({ scope: 'question_generation', instruction: '优先深挖系统设计取舍' })],
          summaryMemoryItems: [memoryItem({ scope: 'summary_generation', instruction: '结论先行' })],
          questionGuidancePrompt: 'memory question guidance',
          summaryGuidancePrompt: 'memory summary guidance',
          updatedAt: '2026-04-06T00:00:00.000Z',
          sampleSize: 5,
          version: 1,
        },
      },
      'question_generation'
    );

    expect(prompt).toBe('memory question guidance');
  });

  it('does not inject fallback guidance into generation when no memory exists', () => {
    const prompt = getInjectedGenerationGuidancePrompt(
      {
        ...buildPosition('question_generation'),
        generationMemory: undefined,
        generationGuidance: undefined,
      },
      'question_generation'
    );

    expect(prompt).toBeUndefined();
  });

  it('does not inflate evidence count when the same evidence is synthesized again', () => {
    const packets = buildMemoryEvidencePackets(
      [
        event({
          type: 'question_edited',
          questionId: 'q-1',
          details: {
            source: 'resume',
            evaluationDimension: '专业能力',
            originalText: '请介绍一下项目',
            editedText: '请具体介绍推荐系统召回链路设计',
            editPattern: '更具体',
          },
        }),
      ],
      'question_generation'
    );

    const firstPass = synthesizeGenerationMemory('question_generation', [], packets, '2026-04-06T09:00:00.000Z');
    const secondPass = synthesizeGenerationMemory(
      'question_generation',
      firstPass.memoryItems,
      packets,
      '2026-04-06T10:00:00.000Z'
    );

    expect(secondPass.memoryItems[0]?.evidenceCount).toBe(firstPass.memoryItems[0]?.evidenceCount);
  });
});
