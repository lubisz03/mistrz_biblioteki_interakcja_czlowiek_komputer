import { create } from 'zustand';
import type { Match, Question, MatchResult } from '../types/api';

interface MatchState {
  currentMatch: Match | null;
  currentQuestion: Question | null;
  questionResults: MatchResult[];
  isReady: boolean;
  setCurrentMatch: (match: Match | null) => void;
  setCurrentQuestion: (question: Question | null) => void;
  addQuestionResult: (result: MatchResult) => void;
  setReady: (ready: boolean) => void;
  reset: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  currentMatch: null,
  currentQuestion: null,
  questionResults: [],
  isReady: false,
  setCurrentMatch: (match) => set({ currentMatch: match }),
  setCurrentQuestion: (question) => set({ currentQuestion: question }),
  addQuestionResult: (result) => set((state) => ({
    questionResults: [...state.questionResults, result],
  })),
  setReady: (ready) => set({ isReady: ready }),
  reset: () => set({
    currentMatch: null,
    currentQuestion: null,
    questionResults: [],
    isReady: false,
  }),
}));
