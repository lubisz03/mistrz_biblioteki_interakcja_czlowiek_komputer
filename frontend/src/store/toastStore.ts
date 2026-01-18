import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // w milisekundach, domyślnie 5000
}

interface ToastState {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (type, message, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, type, message, duration };
    set((state) => ({ toasts: [...state.toasts, toast] }));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearAll: () => set({ toasts: [] }),
}));
