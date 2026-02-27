import { create } from 'zustand';
import type { Position, Candidate, Question, InterviewResult, CodingChallenge } from '@/types';
import { saveToStorage, loadFromStorage } from '@/utils/storage';

interface PositionState {
  positions: Position[];

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'createdAt' | 'candidates'>) => Position;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  deletePosition: (id: string) => void;
  getPosition: (id: string) => Position | undefined;

  // Candidate actions
  addCandidate: (positionId: string, candidate: Omit<Candidate, 'id' | 'questions'>) => Candidate;
  updateCandidate: (positionId: string, candidateId: string, updates: Partial<Candidate>) => void;
  deleteCandidate: (positionId: string, candidateId: string) => void;
  getCandidate: (positionId: string, candidateId: string) => Candidate | undefined;

  // Question actions
  addQuestion: (positionId: string, candidateId: string, question: Omit<Question, 'id'>) => void;
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

  addPosition: (positionData) => {
    const position: Position = {
      ...positionData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      candidates: [],
    };
    set((state) => {
      const newState = { positions: [...state.positions, position] };
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
    return position;
  },

  updatePosition: (id, updates) => {
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  deletePosition: (id) => {
    set((state) => {
      const newState = {
        positions: state.positions.filter((p) => p.id !== id),
      };
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  getPosition: (id) => {
    return get().positions.find((p) => p.id === id);
  },

  addCandidate: (positionId, candidateData) => {
    const candidate: Candidate = {
      ...candidateData,
      id: generateId(),
      questions: [],
    };
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? { ...p, candidates: [...p.candidates, candidate] }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
    return candidate;
  },

  updateCandidate: (positionId, candidateId, updates) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  deleteCandidate: (positionId, candidateId) => {
    set((state) => {
      const newState = {
        positions: state.positions.map((p) =>
          p.id === positionId
            ? { ...p, candidates: p.candidates.filter((c) => c.id !== candidateId) }
            : p
        ),
      };
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  getCandidate: (positionId, candidateId) => {
    const position = get().getPosition(positionId);
    return position?.candidates.find((c) => c.id === candidateId);
  },

  addQuestion: (positionId, candidateId, questionData) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  updateQuestion: (positionId, candidateId, questionId, updates) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  deleteQuestion: (positionId, candidateId, questionId) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  setQuestions: (positionId, candidateId, questions) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  addCodingChallenge: (positionId, candidateId) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  updateCodingChallenge: (positionId, candidateId, challengeId, updates) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  deleteCodingChallenge: (positionId, candidateId, challengeId) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  setInterviewResult: (positionId, candidateId, result) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
      return newState;
    });
  },

  completeInterview: (positionId, candidateId, result) => {
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
      saveToStorage({ positions: newState.positions, settings: {} });
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
    saveToStorage({ positions: get().positions, settings: {} });
  },
}));
