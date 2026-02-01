import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface ConnectionState {
  matchSocketStatus: ConnectionStatus;
  notificationSocketStatus: ConnectionStatus;
  isOnline: boolean;
  setMatchSocketStatus: (status: ConnectionStatus) => void;
  setNotificationSocketStatus: (status: ConnectionStatus) => void;
  setOnline: (online: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  matchSocketStatus: 'disconnected',
  notificationSocketStatus: 'disconnected',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setMatchSocketStatus: (status) => set({ matchSocketStatus: status }),
  setNotificationSocketStatus: (status) => set({ notificationSocketStatus: status }),
  setOnline: (online) => set({ isOnline: online }),
}));

// Nasłuchuj na zmiany statusu połączenia internetowego
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useConnectionStore.getState().setOnline(true);
    console.log('Connection: Back online');
  });
  
  window.addEventListener('offline', () => {
    useConnectionStore.getState().setOnline(false);
    console.log('Connection: Went offline');
  });
}
