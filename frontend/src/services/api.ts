import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor do dodawania tokena (jeśli potrzebny)
api.interceptors.request.use(
  (config) => {
    // Token jest w cookies, więc nie trzeba go dodawać ręcznie
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor do rozpakowywania odpowiedzi z backendu
api.interceptors.response.use(
  (response) => {
    // Backend zawsze zwraca opakowaną odpowiedź: {status, message, data}
    // Automatycznie rozpakowujemy do response.data = data
    if (response.data && typeof response.data === 'object') {
      // Sprawdź czy jest opakowanie {status, message, data}
      if ('data' in response.data && 'status' in response.data) {
        // Jeśli jest opakowanie, zwracamy tylko data
        const originalData = response.data;
        response.data = response.data.data;
        // Debug: loguj tylko dla matchmaking
        if (response.config.url?.includes('/matches/find/')) {
          console.log('API Interceptor - Original:', originalData);
          console.log('API Interceptor - Unpacked:', response.data);
        }
      }
    }
    return response;
  },
  async (error) => {
    // Unified error format handling
    const apiError = {
      status: 'error' as const,
      message: error.response?.data?.message || error.message || 'Wystąpił nieoczekiwany błąd',
      code: error.response?.data?.data?.code || error.response?.data?.code || 'UNKNOWN_ERROR',
      details: error.response?.data?.data?.details || error.response?.data?.details || error.response?.data,
      timestamp: error.response?.data?.data?.timestamp || error.response?.data?.timestamp || new Date().toISOString(),
    };

    // Attach unified error format to error object
    (error as any).apiError = apiError;

    if (error.response?.status === 401) {
      // Przekieruj do logowania tylko jeśli nie jesteśmy już na stronie logowania
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
