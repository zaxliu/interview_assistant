import { create } from 'zustand';
import type { Position, Candidate, Question, InterviewResult, CodingChallenge } from '@/types';
import { saveToStorage, loadFromStorage } from '@/utils/storage';

interface PositionState {
  positions: Position[];
  currentUserId: string | null;

  // User context actions
  setCurrentUserId: (userId: string | null) => void;
  loadForUser: (userId: string) => void;
  clearCurrentUser: () => void;

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'createdAt' | 'candidates' | 'userId'>) => Position;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  deletePosition: (id: string) => void;
  getPosition: (id: string) => Position | undefined;

  // Candidate actions
  addCandidate: (positionId: string, candidate: Omit<Candidate, 'id' | 'questions' | 'userId'>) => Candidate;
  updateCandidate: (positionId: string, candidateId: string, updates: Partial<Candidate>) => void;
  deleteCandidate: (positionId: string, candidateId: string) => void;
  getCandidate: (positionId: string, candidateId: string) => Candidate | undefined;

  // Question actions
  addQuestion: (positionId: string, candidateId: string, question: Omit<Question, 'id'>) => void;
  insertQuestion: (positionId: string, candidateId: string, index: number, question: Omit<Question, 'id'>) => string;
  updateQuestion: (positionId: string, candidateId: string, questionId: string, updates: Partial<Question>) => void;
  deleteQuestion: (positionId: string, candidateId: string, questionId: string) => void;
  setQuestions: (positionId: string, candidateId: string, questions: Question[]) => void;

  // Coding Challenge actions
  addCodingChallenge: (positionId: string, candidateId: string) => void;
  updateCodingChallenge: (positionId: string, candidateId: string, challengeId: string, updates: Partial<CodingChallenge>) => void;
  deleteCodingChallenge: (positionId: string, candidateId: string, challengeId: string) => void;

  // Interview result actions
  setInterviewResult: (positionId: string, candidateId: string, result: InterviewResult) => void;
  completeInterview: (positionId: string, candidateId: string, result: InterviewResult) => void;

  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const usePositionStore = create<PositionState>((set, get) => ({
  positions: [],
  currentUserId: null,

  setCurrentUserId: (userId) => {
    set({ currentUserId: userId });
  },

  loadForUser: (userId) => {
    const data = loadFromStorage(userId);
    if (data?.positions) {
      set({ positions: data.positions as Position[], currentUserId: userId });
    } else {
      set({ positions: [], currentUserId: userId });
    }
  },

  clearCurrentUser: () => {
    set({ positions: [], currentUserId: null });
  },

  addPosition: (positionData) => {
    const { currentUserId } = get();
    const position: Position = {
      ...positionData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      candidates: [],
      userId: currentUserId || undefined,
    };
    set((state) => {
      const newState = { positions: [...state.positions, position] };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
    return position;
  },

  updatePosition: (id, updates) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  deletePosition: (id) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.filter((p) => p.id !== id),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  getPosition: (id) => {
    return get().positions.find((p) => p.id === id);
  },

  addCandidate: (positionId, candidateData) => {
    const { currentUserId } = get();
    const candidate: Candidate = {
      ...candidateData,
      id: generateId(),
      questions: [],
      userId: currentUserId || undefined,
    };
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? { ...p, candidates: [...p.candidates, candidate] }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
    return candidate;
  },

  updateCandidate: (positionId, candidateId, updates) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId ? { ...c, ...updates } : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  deleteCandidate: (positionId, candidateId) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? { ...p, candidates: p.candidates.filter((c) => c.id !== candidateId) }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  getCandidate: (positionId, candidateId) => {
    const position = get().getPosition(positionId);
    return position?.candidates.find((c) => c.id === candidateId);
  },

  addQuestion: (positionId, candidateId, questionData) => {
    const { currentUserId } = get();
    const question: Question = {
      ...questionData,
      id: generateId(),
      status: questionData.status || 'not_reached',
    };
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? { ...c, questions: [...c.questions, question] }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  insertQuestion: (positionId, candidateId, index, questionData) => {
    const { currentUserId } = get();
    const question: Question = {
      ...questionData,
      id: generateId(),
      status: questionData.status || 'not_reached',
    };
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) => {
                  if (c.id !== candidateId) return c;
                  const newQuestions = [...c.questions];
                  newQuestions.splice(index, 0, question);
                  return { ...c, questions: newQuestions };
                }),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
    return question.id;
  },

  updateQuestion: (positionId, candidateId, questionId, updates) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? {
                        ...c,
                        questions: c.questions.map((q) =>
                          q.id === questionId ? { ...q, ...updates } : q
                        ),
                      }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  deleteQuestion: (positionId, candidateId, questionId) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? {
                        ...c,
                        questions: c.questions.filter((q) => q.id !== questionId),
                      }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  setQuestions: (positionId, candidateId, questions) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId ? { ...c, questions } : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  addCodingChallenge: (positionId, candidateId) => {
    const { currentUserId } = get();
    const challenge: CodingChallenge = {
      id: generateId(),
      problem: '',
      result: 'not_completed',
    };
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? { ...c, codingChallenges: [...(c.codingChallenges || []), challenge] }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  updateCodingChallenge: (positionId, candidateId, challengeId, updates) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? {
                        ...c,
                        codingChallenges: c.codingChallenges?.map((ch) =>
                          ch.id === challengeId ? { ...ch, ...updates } : ch
                        ),
                      }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  deleteCodingChallenge: (positionId, candidateId, challengeId) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId
                    ? { ...c, codingChallenges: c.codingChallenges?.filter((ch) => ch.id !== challengeId) }
                    : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  setInterviewResult: (positionId, candidateId, result) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId ? { ...c, interviewResult: result } : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  completeInterview: (positionId, candidateId, result) => {
    const { currentUserId } = get();
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? {
                ...p,
                candidates: p.candidates.map((c) =>
                  c.id === candidateId ? { ...c, interviewResult: result, status: 'completed' as const } : c
                ),
              }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} }, currentUserId || undefined);
      return newState;
    });
  },

  loadFromStorage: () => {
    const data = loadFromStorage();
    if (data?.positions) {
      set({ positions: data.positions as Position[] });
    }
  },

  saveToStorage: () => {
    const { currentUserId } = get();
    saveToStorage({ positions: get().positions, settings: {} }, currentUserId || undefined);
  },
}));
