import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface ConnectionState {
  matchSocketStatus: ConnectionStatus;
  notificationSocketStatus: ConnectionStatus;
  setMatchSocketStatus: (status: ConnectionStatus) => void;
  setNotificationSocketStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  matchSocketStatus: 'disconnected',
  notificationSocketStatus: 'disconnected',
  setMatchSocketStatus: (status) => set({ matchSocketStatus: status }),
  setNotificationSocketStatus: (status) => set({ notificationSocketStatus: status }),
}));
