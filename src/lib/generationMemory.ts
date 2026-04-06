import type {
  AIUsage,
  FeedbackEvent,
  GenerationGuidance,
  GenerationMemory,
  GenerationMemoryItem,
  GenerationMemoryState,
  MemoryEvidencePacket,
  MemoryRefreshScope,
  Position,
} from '@/types';

const QUESTION_GUIDANCE_FALLBACK =
  '【岗位历史反馈指引-问题】暂无足够反馈，优先覆盖专业能力、通用素质、适配度并控制问题去重。';
const SUMMARY_GUIDANCE_FALLBACK =
  '【岗位历史反馈指引-面评】暂无足够反馈，重点输出可验证证据、核心优势与风险、明确录用结论。';
const REFRESH_EVENT_THRESHOLD = 5;
const REFRESH_CANDIDATE_THRESHOLD = 2;
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;
const STALE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_CANDIDATE_LIMIT = 20;
const MEMORY_VERSION = 1;

export type MemoryRefreshTrigger = 'lazy' | 'generation' | 'manual';

export interface MemoryRefreshDecision {
  shouldRefresh: boolean;
  reason: 'dirty' | 'threshold' | 'stale' | 'generation' | 'manual' | 'cooldown' | 'clean';
  pendingEventCount: number;
  pendingCandidateCount: number;
  lastRefreshAt?: string;
}

export interface MemorySynthesisResult {
  memoryItems: GenerationMemoryItem[];
  guidancePrompt: string;
  updatedAt: string;
  sampleSize: number;
  version: number;
}

export interface GenerationMemoryRefreshResult {
  refreshed: boolean;
  usage?: AIUsage;
  error?: string;
}

export interface ManualGenerationMemoryRefreshResult {
  refreshedScopes: MemoryRefreshScope[];
  usageByScope: Partial<Record<MemoryRefreshScope, AIUsage>>;
  error?: string;
  scopeErrors?: Partial<Record<MemoryRefreshScope, string>>;
}

const safeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const uniqueBy = <T>(items: T[], keyBuilder: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyBuilder(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
};

const normalizeForKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const ensureScope = (scope: MemoryRefreshScope): MemoryRefreshScope => scope;

const getScopePrompt = (scope: MemoryRefreshScope): string => (
  scope === 'question_generation' ? '问题' : '面评'
);

const getScopeFallback = (scope: MemoryRefreshScope): string => (
  scope === 'question_generation' ? QUESTION_GUIDANCE_FALLBACK : SUMMARY_GUIDANCE_FALLBACK
);

const getRefreshAt = (state: GenerationMemoryState | undefined, scope: MemoryRefreshScope): string | undefined => (
  scope === 'question_generation' ? state?.lastQuestionRefreshAt : state?.lastSummaryRefreshAt
);

const getPendingEventCount = (state: GenerationMemoryState | undefined, scope: MemoryRefreshScope): number => (
  scope === 'question_generation'
    ? state?.pendingQuestionEventCount || 0
    : state?.pendingSummaryEventCount || 0
);

const getPendingCandidateCount = (state: GenerationMemoryState | undefined, scope: MemoryRefreshScope): number => (
  scope === 'question_generation'
    ? state?.pendingQuestionCandidateCount || 0
    : state?.pendingSummaryCandidateCount || 0
);

const getGuidancePrompt = (memory: GenerationMemory | undefined, scope: MemoryRefreshScope): string => {
  const prompt = scope === 'question_generation'
    ? memory?.questionGuidancePrompt
    : memory?.summaryGuidancePrompt;
  return prompt?.trim() || '';
};

const getLegacyGuidancePrompt = (guidance: GenerationGuidance | undefined, scope: MemoryRefreshScope): string => {
  const prompt = scope === 'question_generation'
    ? guidance?.questionGuidance
    : guidance?.summaryGuidance;
  return prompt?.trim() || '';
};

const withScope = (scope: MemoryRefreshScope, payload: Record<string, unknown>): Record<string, unknown> => ({
  scope,
  ...payload,
});

const getQuestionPacketSummary = (event: FeedbackEvent): { summary: string; payload: Record<string, unknown> } => {
  const details = event.details || {};
  const source = safeString(details.source);
  const dimension = safeString(details.evaluationDimension);
  const editPattern = safeString(details.editPattern);
  const originalText = safeString(details.originalText);
  const editedText = safeString(details.editedText);
  const questionText = safeString(details.questionText || details.text);

  if (event.type === 'question_asked') {
    return {
      summary: `采纳问题反馈：${[source, dimension, questionText].filter(Boolean).join(' / ') || event.questionId || 'question'}`,
      payload: withScope('question_generation', {
        candidateId: event.candidateId,
        questionId: event.questionId,
        source,
        evaluationDimension: dimension,
        text: questionText,
        context: safeString(details.context),
        isAIGenerated: Boolean(details.isAIGenerated),
        cameFromMeetingNotes: Boolean(details.cameFromMeetingNotes),
        historicalReviewSummary: safeString(details.historicalReviewSummary),
      }),
    };
  }

  if (event.type === 'question_edited') {
    const inferredPattern =
      editPattern ||
      (originalText && editedText
        ? editedText.length > originalText.length * 1.15
          ? '扩展题干'
          : editedText.length < originalText.length * 0.85
            ? '缩短题干'
            : '改写题干'
        : '改写题干');
    return {
      summary: `编辑问题反馈：${[inferredPattern, source, dimension].filter(Boolean).join(' / ') || event.questionId || 'question'}`,
      payload: withScope('question_generation', {
        candidateId: event.candidateId,
        questionId: event.questionId,
        source,
        evaluationDimension: dimension,
        editPattern: inferredPattern,
        originalText,
        editedText,
        questionText,
      }),
    };
  }

  return {
    summary: `删除问题反馈：${[source, dimension, questionText].filter(Boolean).join(' / ') || event.questionId || 'question'}`,
    payload: withScope('question_generation', {
      candidateId: event.candidateId,
      questionId: event.questionId,
      source,
      evaluationDimension: dimension,
      questionText,
      duplicateHint: Boolean(details.duplicateHint),
    }),
  };
};

const getSummaryPacketSummary = (event: FeedbackEvent): { summary: string; payload: Record<string, unknown> } => {
  const details = event.details || {};
  const preferences = Array.isArray(details.preferences)
    ? (details.preferences as string[]).map((item) => safeString(item)).filter(Boolean)
    : [];
  const preference = safeString(details.preference);
  const intensity = safeString(details.rewriteIntensity);
  const draft = safeString(details.generatedSummaryDraft || details.aiDraft);
  const finalSummary = safeString(details.finalSummary);
  const collectedPreferences = uniqueBy(
    [...preferences, preference].filter(Boolean).map((item) => item.trim()),
    (item) => normalizeForKey(item)
  );

  return {
    summary: `面评重写反馈：${[intensity, ...collectedPreferences.slice(0, 2)].filter(Boolean).join(' / ') || event.candidateId}`,
    payload: withScope('summary_generation', {
      candidateId: event.candidateId,
      questionId: event.questionId,
      rewriteIntensity: intensity,
      preferences: collectedPreferences,
      draft,
      finalSummary,
      changedConclusion: Boolean(details.changedConclusion),
      changedScore: Boolean(details.changedScore),
      changedStructure: Boolean(details.changedStructure),
    }),
  };
};

const packetFromEvent = (event: FeedbackEvent, scope: MemoryRefreshScope): MemoryEvidencePacket | null => {
  if (scope === 'question_generation') {
    if (event.type !== 'question_asked' && event.type !== 'question_edited' && event.type !== 'question_deleted') {
      return null;
    }
    const packet = getQuestionPacketSummary(event);
    return {
      scope,
      eventType: event.type,
      candidateId: event.candidateId,
      createdAt: event.createdAt,
      summary: packet.summary,
      payload: packet.payload,
    };
  }

  if (event.type !== 'summary_rewritten') {
    return null;
  }
  const packet = getSummaryPacketSummary(event);
  return {
    scope,
    eventType: event.type,
    candidateId: event.candidateId,
    createdAt: event.createdAt,
    summary: packet.summary,
    payload: packet.payload,
  };
};

const deriveQuestionInstruction = (packet: MemoryEvidencePacket): { kind: GenerationMemoryItem['kind']; instruction: string } => {
  const payload = packet.payload;
  const source = safeString(payload.source);
  const dimension = safeString(payload.evaluationDimension);
  const pattern = safeString(payload.editPattern);

  if (packet.eventType === 'question_deleted') {
    return {
      kind: 'avoid',
      instruction: source || dimension
        ? `减少${[source, dimension].filter(Boolean).join(' / ')}相关的重复或无效问题`
        : '减少重复或无效问题',
    };
  }

  if (packet.eventType === 'question_edited') {
    if (pattern.includes('缩短')) {
      return { kind: 'prefer', instruction: '问题尽量简洁直接，避免冗长题干' };
    }
    if (pattern.includes('具体')) {
      return { kind: 'prioritize', instruction: '问题需要更具体，尽量贴近候选人真实经历和关键细节' };
    }
    if (pattern.includes('扩展')) {
      return { kind: 'prioritize', instruction: '问题需要更具体，尽量贴近候选人真实经历和关键细节' };
    }
    return { kind: 'prioritize', instruction: '优先把问题改写得更贴近业务场景和真实细节' };
  }

  return {
    kind: 'prioritize',
    instruction: source || dimension
      ? `优先覆盖${[source, dimension].filter(Boolean).join(' / ')}`
      : '优先覆盖岗位关键考察点',
  };
};

const deriveSummaryInstruction = (packet: MemoryEvidencePacket): { kind: GenerationMemoryItem['kind']; instruction: string } => {
  const payload = packet.payload;
  const preferences = Array.isArray(payload.preferences)
    ? (payload.preferences as string[]).map((item) => safeString(item)).filter(Boolean)
    : [];
  const intensity = safeString(payload.rewriteIntensity);

  if (preferences.length > 0) {
    return {
      kind: 'prefer',
      instruction: preferences[0].length > 0
        ? `面评输出时优先遵守：${preferences[0]}`
        : '面评输出时优先遵守稳定偏好',
    };
  }

  if (intensity) {
    return {
      kind: 'preserve',
      instruction: `保持${intensity}强度的面评改写风格`,
    };
  }

  return {
    kind: 'prefer',
    instruction: '面评输出应以证据链、结论和风险为主',
  };
};

const deriveInstruction = (packet: MemoryEvidencePacket): { kind: GenerationMemoryItem['kind']; instruction: string } => (
  packet.scope === 'question_generation' ? deriveQuestionInstruction(packet) : deriveSummaryInstruction(packet)
);

const deriveRationale = (packet: MemoryEvidencePacket): string => packet.summary;

const itemKey = (item: GenerationMemoryItem): string =>
  `${item.scope}:${item.kind}:${normalizeForKey(item.instruction)}`;

const mergeMemoryItems = (
  existingItems: GenerationMemoryItem[],
  incomingItems: GenerationMemoryItem[]
): GenerationMemoryItem[] => {
  const merged = new Map<string, GenerationMemoryItem>();

  for (const item of existingItems) {
    merged.set(itemKey(item), item);
  }

  for (const incoming of incomingItems) {
    const key = itemKey(incoming);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, incoming);
      continue;
    }

    merged.set(key, {
      ...existing,
      rationale: incoming.rationale || existing.rationale,
      evidenceCount: Math.max(existing.evidenceCount, incoming.evidenceCount),
      confidence: Math.max(existing.confidence, incoming.confidence),
      lastSeenAt: existing.lastSeenAt > incoming.lastSeenAt ? existing.lastSeenAt : incoming.lastSeenAt,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (b.evidenceCount !== a.evidenceCount) {
      return b.evidenceCount - a.evidenceCount;
    }
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
};

const renderGuidancePrompt = (scope: MemoryRefreshScope, items: GenerationMemoryItem[]): string => {
  if (!items.length) {
    return getScopeFallback(scope);
  }

  const lines = items
    .slice(0, 8)
    .map((item) => `- ${item.instruction}（证据 ${item.evidenceCount}，置信度 ${item.confidence.toFixed(2)}）`);

  return `【岗位记忆-${getScopePrompt(scope)}】\n${lines.join('\n')}`;
};

const getScopeItems = (memory: GenerationMemory | undefined, scope: MemoryRefreshScope): GenerationMemoryItem[] => (
  scope === 'question_generation'
    ? memory?.questionMemoryItems || []
    : memory?.summaryMemoryItems || []
);

const eventMatchesScope = (event: FeedbackEvent, scope: MemoryRefreshScope): boolean => (
  scope === 'question_generation'
    ? event.type === 'question_asked' || event.type === 'question_edited' || event.type === 'question_deleted'
    : event.type === 'summary_rewritten'
);

const selectRecentCandidateIds = (events: FeedbackEvent[]): Set<string> => {
  const latestByCandidate = new Map<string, string>();

  events.forEach((event) => {
    const current = latestByCandidate.get(event.candidateId);
    if (!current || event.createdAt > current) {
      latestByCandidate.set(event.candidateId, event.createdAt);
    }
  });

  return new Set(
    Array.from(latestByCandidate.entries())
      .sort(([, left], [, right]) => right.localeCompare(left))
      .slice(0, RECENT_CANDIDATE_LIMIT)
      .map(([candidateId]) => candidateId)
  );
};

export const createEmptyGenerationMemoryState = (): GenerationMemoryState => ({
  dirtyScopes: [],
  pendingQuestionEventCount: 0,
  pendingSummaryEventCount: 0,
  pendingQuestionCandidateCount: 0,
  pendingSummaryCandidateCount: 0,
});

export const buildMemoryEvidencePackets = (
  events: FeedbackEvent[],
  scope: MemoryRefreshScope
): MemoryEvidencePacket[] => {
  const scopedEvents = events.filter((event) => eventMatchesScope(event, scope));
  const recentCandidateIds = selectRecentCandidateIds(scopedEvents);

  return scopedEvents
  .filter((event) => recentCandidateIds.has(event.candidateId))
  .map((event) => packetFromEvent(event, scope))
  .filter((packet): packet is MemoryEvidencePacket => Boolean(packet));
};

export const getGenerationGuidancePrompt = (
  position: Position,
  scope: MemoryRefreshScope
): string => {
  const memoryPrompt = getGuidancePrompt(position.generationMemory, scope);
  if (memoryPrompt) {
    return memoryPrompt;
  }

  const legacyPrompt = getLegacyGuidancePrompt(position.generationGuidance, scope);
  if (legacyPrompt) {
    return legacyPrompt;
  }

  return getScopeFallback(scope);
};

export const getInjectedGenerationGuidancePrompt = (
  position: Position,
  scope: MemoryRefreshScope
): string | undefined => {
  const memoryPrompt = getGuidancePrompt(position.generationMemory, scope);
  if (memoryPrompt) {
    return memoryPrompt;
  }

  const legacyPrompt = getLegacyGuidancePrompt(position.generationGuidance, scope);
  if (legacyPrompt) {
    return legacyPrompt;
  }

  return undefined;
};

export const shouldRefreshGenerationMemory = (
  position: Position,
  scope: MemoryRefreshScope,
  options: {
    trigger?: MemoryRefreshTrigger;
    nowIso?: string;
  } = {}
): MemoryRefreshDecision => {
  const trigger = options.trigger || 'lazy';
  const now = new Date(options.nowIso || new Date().toISOString());
  const state = position.generationMemoryState;
  const dirty = Boolean(state?.dirtyScopes.includes(ensureScope(scope)));
  const pendingEventCount = getPendingEventCount(state, scope);
  const pendingCandidateCount = getPendingCandidateCount(state, scope);
  const lastRefreshAt = getRefreshAt(state, scope);
  const lastRefreshTime = lastRefreshAt ? new Date(lastRefreshAt).getTime() : 0;
  const isWithinCooldown = lastRefreshTime > 0 && now.getTime() - lastRefreshTime < REFRESH_COOLDOWN_MS;
  const isStale = lastRefreshTime > 0 && now.getTime() - lastRefreshTime > STALE_REFRESH_MS;
  const meetsThreshold = pendingEventCount >= REFRESH_EVENT_THRESHOLD || pendingCandidateCount >= REFRESH_CANDIDATE_THRESHOLD || isStale;

  if (!dirty) {
    return {
      shouldRefresh: false,
      reason: 'clean',
      pendingEventCount,
      pendingCandidateCount,
      lastRefreshAt,
    };
  }

  if (trigger === 'manual') {
    return {
      shouldRefresh: true,
      reason: 'manual',
      pendingEventCount,
      pendingCandidateCount,
      lastRefreshAt,
    };
  }

  if (trigger === 'generation') {
    return {
      shouldRefresh: true,
      reason: 'generation',
      pendingEventCount,
      pendingCandidateCount,
      lastRefreshAt,
    };
  }

  if (isWithinCooldown) {
    return {
      shouldRefresh: false,
      reason: 'cooldown',
      pendingEventCount,
      pendingCandidateCount,
      lastRefreshAt,
    };
  }

  return {
    shouldRefresh: meetsThreshold,
    reason: meetsThreshold ? (isStale ? 'stale' : 'threshold') : 'dirty',
    pendingEventCount,
    pendingCandidateCount,
    lastRefreshAt,
  };
};

export const synthesizeGenerationMemory = (
  scope: MemoryRefreshScope,
  existingMemoryItems: GenerationMemoryItem[],
  evidencePackets: MemoryEvidencePacket[],
  nowIso: string = new Date().toISOString()
): MemorySynthesisResult => {
  const normalizedItems = evidencePackets.map((packet, index) => {
    const instruction = deriveInstruction(packet);
    return {
      id: `${scope}-${packet.eventType}-${index}-${normalizeForKey(instruction.instruction).slice(0, 24) || 'memory'}`,
      scope,
      kind: instruction.kind,
      instruction: instruction.instruction,
      rationale: deriveRationale(packet),
      evidenceCount: 1,
      confidence: 0.62,
      lastSeenAt: packet.createdAt || nowIso,
    } satisfies GenerationMemoryItem;
  });

  const mergedItems = mergeMemoryItems(
    existingMemoryItems.filter((item) => item.scope === scope),
    normalizedItems
  );

  return {
    memoryItems: mergedItems,
    guidancePrompt: renderGuidancePrompt(scope, mergedItems),
    updatedAt: nowIso,
    sampleSize: uniqueBy(evidencePackets, (packet) => packet.candidateId).length || Math.min(evidencePackets.length, RECENT_CANDIDATE_LIMIT),
    version: MEMORY_VERSION,
  };
};

export const splitGenerationMemory = (
  memory: GenerationMemory | undefined,
  scope: MemoryRefreshScope
): GenerationMemoryItem[] => getScopeItems(memory, scope);

export const updateGenerationMemoryStateForFeedback = (
  state: GenerationMemoryState | undefined,
  feedbackEvents: FeedbackEvent[],
  nextEvent: FeedbackEvent,
  scope: MemoryRefreshScope
): GenerationMemoryState => {
  const base = state ? { ...state } : createEmptyGenerationMemoryState();
  const dirtyScopes = base.dirtyScopes.includes(scope) ? base.dirtyScopes : [...base.dirtyScopes, scope];
  const lastRefreshAt = getRefreshAt(base, scope);
  const pendingEvents = feedbackEvents.filter((event) => {
    if (!eventMatchesScope(event, scope)) {
      return false;
    }
    if (!lastRefreshAt) {
      return true;
    }
    return event.createdAt > lastRefreshAt;
  });
  const pendingCandidateCount = new Set(pendingEvents.map((event) => event.candidateId)).size;

  if (scope === 'question_generation') {
    return {
      ...base,
      dirtyScopes,
      pendingQuestionEventCount: base.pendingQuestionEventCount + 1,
      pendingQuestionCandidateCount: pendingCandidateCount || (nextEvent.candidateId ? 1 : 0),
    };
  }

  return {
    ...base,
    dirtyScopes,
    pendingSummaryEventCount: base.pendingSummaryEventCount + 1,
    pendingSummaryCandidateCount: pendingCandidateCount || (nextEvent.candidateId ? 1 : 0),
  };
};

export const clearGenerationMemoryStateForScope = (
  state: GenerationMemoryState | undefined,
  scope: MemoryRefreshScope,
  usage?: { input: number; cached: number; output: number },
  manualRefresh: boolean = false,
  nowIso: string = new Date().toISOString()
): GenerationMemoryState => {
  const base = state ? { ...state } : createEmptyGenerationMemoryState();
  const dirtyScopes = base.dirtyScopes.filter((item) => item !== scope);

  if (scope === 'question_generation') {
    return {
      ...base,
      dirtyScopes,
      pendingQuestionEventCount: 0,
      pendingQuestionCandidateCount: 0,
      lastQuestionRefreshAt: nowIso,
      lastQuestionRefreshUsage: usage,
      lastManualRefreshAt: manualRefresh ? nowIso : base.lastManualRefreshAt,
    };
  }

  return {
    ...base,
    dirtyScopes,
    pendingSummaryEventCount: 0,
    pendingSummaryCandidateCount: 0,
    lastSummaryRefreshAt: nowIso,
    lastSummaryRefreshUsage: usage,
    lastManualRefreshAt: manualRefresh ? nowIso : base.lastManualRefreshAt,
  };
};
