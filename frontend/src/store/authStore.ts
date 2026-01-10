import { create } from 'zustand';
import type { User } from '../types/api';
import { getCurrentUser } from '../services/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  setUser: (user) => set({ user }),
  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const user = await getCurrentUser();
      set({ user, isLoading: false });
    } catch (error) {
      set({ user: null, isLoading: false });
    }
  },
  initialize: async () => {
    if (get().isInitialized) return;
    set({ isLoading: true, isInitialized: false });
    try {
      const user = await getCurrentUser();
      set({ user, isLoading: false, isInitialized: true });
    } catch (error) {
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },
  logout: async () => {
    const { logout: logoutService } = await import('../services/auth');
    await logoutService();
    set({ user: null, isInitialized: false });
  },
}));
