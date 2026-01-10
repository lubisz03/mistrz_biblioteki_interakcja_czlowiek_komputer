import api from './api';
import type { User } from '../types/api';

export const getAuthToken = (): string | null => {
  // Token jest w cookies, więc nie trzeba go pobierać
  // Ale jeśli potrzebujemy tokena dla WebSocket, możemy go pobrać z cookies
  const cookies = document.cookie.split(';');
  console.log('All cookies:', document.cookie);
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    console.log('Cookie:', name, '=', value ? '***' : 'empty');
    if (name === 'access') {
      console.log('Found access token cookie');
      return value;
    }
  }
  console.log('No access token cookie found');
  return null;
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
  } catch (error) {
    return null;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout/');
  } catch (error) {
    console.error('Logout error:', error);
  }
};
