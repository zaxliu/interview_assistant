import { create } from 'zustand';
import type {
  AIUsage,
  Position,
  Candidate,
  Question,
  InterviewResult,
  CodingChallenge,
  FeedbackEvent,
  MemoryRefreshScope,
  GenerationMemory,
  GenerationMemoryItem,
} from '@/types';
import { synthesizePositionMemory } from '@/api/ai';
import { saveToStorage, loadFromStorage } from '@/utils/storage';
import { trackEvent } from '@/lib/analytics';
import {
  buildMemoryEvidencePackets,
  clearGenerationMemoryStateForScope,
  createEmptyGenerationMemoryState,
  GenerationMemoryRefreshResult,
  ManualGenerationMemoryRefreshResult,
  getGenerationGuidancePrompt,
  shouldRefreshGenerationMemory,
  updateGenerationMemoryStateForFeedback,
} from '@/lib/generationMemory';
import { useSettingsStore } from '@/store/settingsStore';

interface PositionState {
  positions: Position[];
  currentUserId: string | null;
  setCurrentUserId: (userId: string | null) => void;
  loadForUser: (userId: string) => void;
  clearCurrentUser: () => void;
  addPosition: (position: Omit<Position, 'id' | 'createdAt' | 'candidates' | 'userId'>) => Position;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  deletePosition: (id: string) => void;
  getPosition: (id: string) => Position | undefined;
  addCandidate: (positionId: string, candidate: Omit<Candidate, 'id' | 'questions' | 'userId'>) => Candidate;
  updateCandidate: (positionId: string, candidateId: string, updates: Partial<Candidate>) => void;
  deleteCandidate: (positionId: string, candidateId: string) => void;
  getCandidate: (positionId: string, candidateId: string) => Candidate | undefined;
  addQuestion: (positionId: string, candidateId: string, question: Omit<Question, 'id'>) => string;
  insertQuestion: (positionId: string, candidateId: string, index: number, question: Omit<Question, 'id'>) => string;
  updateQuestion: (positionId: string, candidateId: string, questionId: string, updates: Partial<Question>) => void;
  deleteQuestion: (positionId: string, candidateId: string, questionId: string) => void;
  setQuestions: (positionId: string, candidateId: string, questions: Question[]) => void;
  addCodingChallenge: (positionId: string, candidateId: string) => void;
  updateCodingChallenge: (positionId: string, candidateId: string, challengeId: string, updates: Partial<CodingChallenge>) => void;
  deleteCodingChallenge: (positionId: string, candidateId: string, challengeId: string) => void;
  setInterviewResult: (positionId: string, candidateId: string, result: InterviewResult) => void;
  completeInterview: (positionId: string, candidateId: string, result: InterviewResult) => void;
  recordFeedbackEvent: (
    positionId: string,
    event: Omit<FeedbackEvent, 'id' | 'createdAt'>
  ) => void;
  ensureGenerationMemoryFresh: (positionId: string, scope: MemoryRefreshScope) => Promise<GenerationMemoryRefreshResult>;
  refreshGenerationMemory: (
    positionId: string,
    scope?: MemoryRefreshScope
  ) => Promise<ManualGenerationMemoryRefreshResult | GenerationMemoryRefreshResult>;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);
const scopeRefreshInFlight = new Map<string, Promise<GenerationMemoryRefreshResult>>();

const shouldSkipDuplicateFeedback = (
  existingEvents: FeedbackEvent[] | undefined,
  nextEvent: Omit<FeedbackEvent, 'id' | 'createdAt'>
): boolean => {
  if (!existingEvents?.length) {
    return false;
  }

  if (nextEvent.type === 'question_asked' || nextEvent.type === 'question_edited') {
    // Guard: question_asked/question_edited MUST have questionId for proper deduplication
    if (!nextEvent.questionId) {
      console.warn(`[positionStore] ${nextEvent.type} event missing questionId — cannot dedupe properly`, nextEvent);
      return false;
    }
    return existingEvents.some((event) => (
      event.type === nextEvent.type &&
      event.candidateId === nextEvent.candidateId &&
      event.questionId &&
      event.questionId === nextEvent.questionId
    ));
  }

  return false;
};

const persistPositions = (positions: Position[], currentUserId: string | null) => {
  saveToStorage({ positions, settings: {} }, currentUserId || undefined);
};

const updatePositions = (
  positions: Position[],
  updater: (positions: Position[]) => Position[]
): Position[] => updater(positions);

const updateCandidateCollection = (
  positions: Position[],
  positionId: string,
  candidateId: string,
  updater: (candidate: Candidate) => Candidate
): Position[] =>
  positions.map((position) =>
    position.id === positionId
      ? {
          ...position,
          candidates: position.candidates.map((candidate) =>
            candidate.id === candidateId ? updater(candidate) : candidate
          ),
        }
      : position
  );

const mergeGenerationMemory = (
  position: Position,
  scope: MemoryRefreshScope,
  memoryResult: {
    memoryItems: GenerationMemoryItem[];
    guidancePrompt: string;
    updatedAt: string;
    sampleSize: number;
    version: number;
  },
  nowIso: string
): Position => {
  const existingMemory = position.generationMemory;
  const nextMemory: GenerationMemory = {
    questionMemoryItems:
      scope === 'question_generation'
        ? memoryResult.memoryItems
        : existingMemory?.questionMemoryItems || [],
    summaryMemoryItems:
      scope === 'summary_generation'
        ? memoryResult.memoryItems
        : existingMemory?.summaryMemoryItems || [],
    questionGuidancePrompt:
      scope === 'question_generation'
        ? memoryResult.guidancePrompt
        : existingMemory?.questionGuidancePrompt || getGenerationGuidancePrompt(position, 'question_generation'),
    summaryGuidancePrompt:
      scope === 'summary_generation'
        ? memoryResult.guidancePrompt
        : existingMemory?.summaryGuidancePrompt || getGenerationGuidancePrompt(position, 'summary_generation'),
    updatedAt: nowIso,
    sampleSize: Math.max(existingMemory?.sampleSize || 0, memoryResult.sampleSize),
    version: memoryResult.version,
  };

  return {
    ...position,
    generationMemory: nextMemory,
    generationGuidance: {
      questionGuidance: nextMemory.questionGuidancePrompt,
      summaryGuidance: nextMemory.summaryGuidancePrompt,
      updatedAt: nowIso,
      sampleSize: nextMemory.sampleSize,
    },
  };
};

const applyPositionScopeMemory = (
  position: Position,
  scope: MemoryRefreshScope,
  synthesis: {
    memoryItems: GenerationMemoryItem[];
    guidancePrompt: string;
    updatedAt: string;
    sampleSize: number;
    version: number;
  },
  usage: AIUsage | undefined,
  nowIso: string,
  manualRefresh: boolean = false
): Position => {
  const refreshedPosition = mergeGenerationMemory(position, scope, synthesis, nowIso);
  const refreshedState = clearGenerationMemoryStateForScope(
    refreshedPosition.generationMemoryState || createEmptyGenerationMemoryState(),
    scope,
    usage,
    manualRefresh,
    nowIso
  );

  return {
    ...refreshedPosition,
    generationMemoryState: refreshedState,
  };
};

const scopeRefreshKey = (positionId: string, scope: MemoryRefreshScope): string => `${positionId}:${scope}`;

export const usePositionStore = create<PositionState>((set, get) => ({
  positions: [],
  currentUserId: null,

  setCurrentUserId: (userId) => {
    set({ currentUserId: userId });
  },

  loadForUser: (userId) => {
    const data = loadFromStorage(userId);
    set({
      positions: Array.isArray(data?.positions) ? (data?.positions as Position[]) : [],
      currentUserId: userId,
    });
  },

  clearCurrentUser: () => {
    set({ positions: [], currentUserId: null });
  },

  addPosition: (positionData) => {
    const currentUserId = get().currentUserId;
    const position: Position = {
      ...positionData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      candidates: [],
      userId: currentUserId || undefined,
    };

    set((state) => {
      const positions = [...state.positions, position];
      persistPositions(positions, state.currentUserId);
      return { positions };
    });

    return position;
  },

  updatePosition: (id, updates) => {
    set((state) => {
      const positions = updatePositions(state.positions, (current) =>
        current.map((position) => (position.id === id ? { ...position, ...updates } : position))
      );
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  deletePosition: (id) => {
    set((state) => {
      const positions = state.positions.filter((position) => position.id !== id);
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  getPosition: (id) => get().positions.find((position) => position.id === id),

  addCandidate: (positionId, candidateData) => {
    const currentUserId = get().currentUserId;
    const candidate: Candidate = {
      ...candidateData,
      id: generateId(),
      questions: [],
      userId: currentUserId || undefined,
    };

    set((state) => {
      const positions = state.positions.map((position) =>
        position.id === positionId
          ? { ...position, candidates: [...position.candidates, candidate] }
          : position
      );
      persistPositions(positions, state.currentUserId);
      return { positions };
    });

    trackEvent({
      eventName: 'candidate_created',
      feature: 'candidate',
      success: true,
      details: {
        source: candidateData.calendarEventId ? 'calendar' : 'manual',
      },
    });

    return candidate;
  },

  updateCandidate: (positionId, candidateId, updates) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        ...updates,
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  deleteCandidate: (positionId, candidateId) => {
    set((state) => {
      const positions = state.positions.map((position) =>
        position.id === positionId
          ? {
              ...position,
              candidates: position.candidates.filter((candidate) => candidate.id !== candidateId),
            }
          : position
      );
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  getCandidate: (positionId, candidateId) => {
    const position = get().getPosition(positionId);
    return position?.candidates.find((candidate) => candidate.id === candidateId);
  },

  addQuestion: (positionId, candidateId, questionData) => {
    const question: Question = {
      ...questionData,
      id: generateId(),
      status: questionData.status || 'not_reached',
    };

    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        questions: [...candidate.questions, question],
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });

    return question.id;
  },

  insertQuestion: (positionId, candidateId, index, questionData) => {
    const question: Question = {
      ...questionData,
      id: generateId(),
      status: questionData.status || 'not_reached',
    };

    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => {
        const questions = [...candidate.questions];
        questions.splice(index, 0, question);
        return { ...candidate, questions };
      });
      persistPositions(positions, state.currentUserId);
      return { positions };
    });

    return question.id;
  },

  updateQuestion: (positionId, candidateId, questionId, updates) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        questions: candidate.questions.map((question) =>
          question.id === questionId ? { ...question, ...updates } : question
        ),
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  deleteQuestion: (positionId, candidateId, questionId) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        questions: candidate.questions.filter((question) => question.id !== questionId),
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  setQuestions: (positionId, candidateId, questions) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        questions,
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  addCodingChallenge: (positionId, candidateId) => {
    const challenge: CodingChallenge = {
      id: generateId(),
      problem: '',
      result: 'not_completed',
    };

    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        codingChallenges: [...(candidate.codingChallenges || []), challenge],
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  updateCodingChallenge: (positionId, candidateId, challengeId, updates) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        codingChallenges: candidate.codingChallenges?.map((challenge) =>
          challenge.id === challengeId ? { ...challenge, ...updates } : challenge
        ),
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  deleteCodingChallenge: (positionId, candidateId, challengeId) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        codingChallenges: candidate.codingChallenges?.filter((challenge) => challenge.id !== challengeId),
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  setInterviewResult: (positionId, candidateId, result) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        interviewResult: result,
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  completeInterview: (positionId, candidateId, result) => {
    set((state) => {
      const positions = updateCandidateCollection(state.positions, positionId, candidateId, (candidate) => ({
        ...candidate,
        interviewResult: result,
        status: 'completed',
      }));
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  recordFeedbackEvent: (positionId, eventData) => {
    set((state) => {
      const positions = state.positions.map((position) => {
        if (position.id !== positionId) {
          return position;
        }

        if (shouldSkipDuplicateFeedback(position.feedbackEvents, eventData)) {
          return position;
        }

        const feedbackEvents = (() => {
          const existing = position.feedbackEvents || [];
          // For summary_rewritten, replace the previous event for the same candidate
          // (each rewrite carries updated preferences, so only the latest matters)
          const base = eventData.type === 'summary_rewritten'
            ? existing.filter((e) => !(e.type === 'summary_rewritten' && e.candidateId === eventData.candidateId))
            : existing;
          return [
            ...base,
            {
              ...eventData,
              id: generateId(),
              createdAt: new Date().toISOString(),
            },
          ].slice(-500);
        })();
        trackEvent({
          eventName: eventData.type,
          feature: 'feedback_loop',
          success: true,
          details: {
            positionId,
            candidateId: eventData.candidateId,
            questionId: eventData.questionId || '',
            ...eventData.details,
          },
        });
        const scope = eventData.type === 'summary_rewritten' ? 'summary_generation' : 'question_generation';
        const nextEvent = feedbackEvents[feedbackEvents.length - 1];
        const generationMemoryState = updateGenerationMemoryStateForFeedback(
          position.generationMemoryState,
          feedbackEvents,
          nextEvent,
          scope
        );

        return {
          ...position,
          feedbackEvents,
          generationMemoryState,
        };
      });
      persistPositions(positions, state.currentUserId);
      return { positions };
    });
  },

  ensureGenerationMemoryFresh: async (positionId, scope) => {
    const position = get().getPosition(positionId);
    if (!position) {
      return { refreshed: false };
    }

    const decision = shouldRefreshGenerationMemory(position, scope, {
      trigger: 'generation',
      nowIso: new Date().toISOString(),
    });
    if (!decision.shouldRefresh) {
      return { refreshed: false };
    }

    return get().refreshGenerationMemory(positionId, scope) as Promise<GenerationMemoryRefreshResult>;
  },

  refreshGenerationMemory: async (positionId, scope) => {
    const refreshScope = async (
      currentScope: MemoryRefreshScope,
      manualRefresh: boolean
    ): Promise<GenerationMemoryRefreshResult> => {
      const key = scopeRefreshKey(positionId, currentScope);
      const existingPromise = scopeRefreshInFlight.get(key);
      if (existingPromise) {
        return existingPromise;
      }

      const task = (async (): Promise<GenerationMemoryRefreshResult> => {
        const settings = useSettingsStore.getState();
        if (!settings.aiApiKey) {
          return { refreshed: false, error: '未配置 AI API Key' };
        }

        const currentPosition = get().getPosition(positionId);
        if (!currentPosition) {
          return { refreshed: false, error: '岗位不存在' };
        }

        const evidencePackets = buildMemoryEvidencePackets(currentPosition.feedbackEvents || [], currentScope);
        const existingItems = currentScope === 'question_generation'
          ? currentPosition.generationMemory?.questionMemoryItems || []
          : currentPosition.generationMemory?.summaryMemoryItems || [];

        try {
          const synthesis = await synthesizePositionMemory(
            { apiKey: settings.aiApiKey, model: settings.aiModel },
            currentScope,
            existingItems,
            evidencePackets
          );
          const nowIso = synthesis.data.updatedAt || new Date().toISOString();

          set((state) => {
            const positions = state.positions.map((position) => (
              position.id === positionId
                ? applyPositionScopeMemory(
                    position,
                    currentScope,
                    synthesis.data,
                    synthesis.usage,
                    nowIso,
                    manualRefresh
                  )
                : position
            ));
            persistPositions(positions, state.currentUserId);
            return { positions };
          });

          return {
            refreshed: true,
            usage: synthesis.usage,
          };
        } catch (error) {
          return {
            refreshed: false,
            error: error instanceof Error ? error.message : '岗位记忆刷新失败',
          };
        }
      })();

      scopeRefreshInFlight.set(key, task);
      try {
        return await task;
      } finally {
        scopeRefreshInFlight.delete(key);
      }
    };

    if (scope) {
      return refreshScope(scope, false);
    }

    const scopes = ['question_generation', 'summary_generation'] as MemoryRefreshScope[];
    const usageByScope: Partial<Record<MemoryRefreshScope, AIUsage>> = {};
    const scopeErrors: Partial<Record<MemoryRefreshScope, string>> = {};
    const refreshedScopes: MemoryRefreshScope[] = [];

    for (const currentScope of scopes) {
      const result = await refreshScope(currentScope, true);
      if (result.refreshed) {
        refreshedScopes.push(currentScope);
        if (result.usage) {
          usageByScope[currentScope] = result.usage;
        }
        continue;
      }
      if (result.error) {
        scopeErrors[currentScope] = result.error;
      }
    }

    return {
      refreshedScopes,
      usageByScope,
      scopeErrors,
    };
  },

  loadFromStorage: () => {
    const data = loadFromStorage();
    set({ positions: Array.isArray(data?.positions) ? (data?.positions as Position[]) : [] });
  },

  saveToStorage: () => {
    const { positions, currentUserId } = get();
    persistPositions(positions, currentUserId);
  },
}));
