import { create } from 'zustand';
import type { User } from '../types/api';

interface MatchNotification {
  matchId: number;
  player: User;
  book: { id: number; title: string; author: string };
  subject: { id: number; name: string; color: string };
  timeout: number;
  type: 'match' | 'invite';
}

interface NotificationState {
  activeUsers: User[];
  notifications: MatchNotification[];
  addActiveUser: (user: User) => void;
  removeActiveUser: (userId: number) => void;
  setActiveUsers: (users: User[]) => void;
  addNotification: (notification: MatchNotification) => void;
  removeNotification: (matchId: number) => void;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  activeUsers: [],
  notifications: [],
  addActiveUser: (user) =>
    set((state) => {
      if (state.activeUsers.find((u) => u.id === user.id)) {
        return state;
      }
      return { activeUsers: [...state.activeUsers, user] };
    }),
  removeActiveUser: (userId) =>
    set((state) => ({
      activeUsers: state.activeUsers.filter((u) => u.id !== userId),
    })),
  setActiveUsers: (users) => set({ activeUsers: users }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [...state.notifications, notification],
    })),
  removeNotification: (matchId) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.matchId !== matchId),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
