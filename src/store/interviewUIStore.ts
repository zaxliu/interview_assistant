import { create } from 'zustand';

interface InterviewUIState {
  hasPdf: boolean;
  setHasPdf: (hasPdf: boolean) => void;
  reset: () => void;
}

export const useInterviewUIStore = create<InterviewUIState>((set) => ({
  hasPdf: false,
  setHasPdf: (hasPdf) => set({ hasPdf }),
  reset: () => set({ hasPdf: false }),
}));
