import { create } from 'zustand';
import type { Position, Candidate, Question, InterviewResult, CodingChallenge } from '@/types';
import { saveToStorage, loadFromStorage } from '@/utils/storage';
import { trackEvent } from '@/lib/analytics';

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
  addQuestion: (positionId: string, candidateId: string, question: Omit<Question, 'id'>) => void;
  insertQuestion: (positionId: string, candidateId: string, index: number, question: Omit<Question, 'id'>) => string;
  updateQuestion: (positionId: string, candidateId: string, questionId: string, updates: Partial<Question>) => void;
  deleteQuestion: (positionId: string, candidateId: string, questionId: string) => void;
  setQuestions: (positionId: string, candidateId: string, questions: Question[]) => void;
  addCodingChallenge: (positionId: string, candidateId: string) => void;
  updateCodingChallenge: (positionId: string, candidateId: string, challengeId: string, updates: Partial<CodingChallenge>) => void;
  deleteCodingChallenge: (positionId: string, candidateId: string, challengeId: string) => void;
  setInterviewResult: (positionId: string, candidateId: string, result: InterviewResult) => void;
  completeInterview: (positionId: string, candidateId: string, result: InterviewResult) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

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

  loadFromStorage: () => {
    const data = loadFromStorage();
    set({ positions: Array.isArray(data?.positions) ? (data?.positions as Position[]) : [] });
  },

  saveToStorage: () => {
    const { positions, currentUserId } = get();
    persistPositions(positions, currentUserId);
  },
}));
