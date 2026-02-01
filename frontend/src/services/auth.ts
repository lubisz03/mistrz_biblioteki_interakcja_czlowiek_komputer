import api from './api';
import type { User } from '../types/api';

export const getAuthToken = (): string | null => {
  return localStorage.getItem('access_token');
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const response = await api.post('/auth/token/verify/');
    // Interceptor już rozpakował response.data.data -> response.data
    const data = response.data;
    if (data.valid && data.user) {
      return data.user;
    }
    return null;
  } catch {
    return null;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout/');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('access_token');
  }
};
