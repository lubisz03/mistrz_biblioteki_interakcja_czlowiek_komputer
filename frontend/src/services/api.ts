import axios, { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000, // 30 sekund timeout - zapobiega nieskończonemu oczekiwaniu
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sprawdza czy błąd jest związany z siecią/połączeniem
 */
export const isNetworkError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return (
      error.code === 'ECONNABORTED' || // timeout
      error.code === 'ERR_NETWORK' || // brak sieci
      error.message === 'Network Error' ||
      !error.response // brak odpowiedzi = problem z siecią
    );
  }
  return false;
};

// Typ dla odpowiedzi błędu z backendu
interface ApiErrorResponse {
  status?: string;
  message?: string;
  data?: {
    code?: string;
    details?: unknown;
    timestamp?: string;
  };
  code?: string;
  details?: unknown;
  timestamp?: string;
}

/**
 * Zwraca przyjazny komunikat błędu dla użytkownika
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    // Błędy sieciowe
    if (error.code === 'ECONNABORTED') {
      return 'Przekroczono czas oczekiwania na odpowiedź serwera. Sprawdź połączenie i spróbuj ponownie.';
    }
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
      return 'Brak połączenia z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie.';
    }

    // Błędy HTTP
    const status = error.response?.status;
    const data = error.response?.data as ApiErrorResponse | undefined;
    const message = data?.message;

    if (message) return message;

    switch (status) {
      case 400:
        return 'Nieprawidłowe dane. Sprawdź wprowadzone informacje.';
      case 401:
        return 'Sesja wygasła. Zaloguj się ponownie.';
      case 403:
        return 'Brak uprawnień do wykonania tej operacji.';
      case 404:
        return 'Nie znaleziono żądanego zasobu.';
      case 429:
        return 'Zbyt wiele żądań. Poczekaj chwilę i spróbuj ponownie.';
      case 500:
      case 502:
      case 503:
        return 'Błąd serwera. Spróbuj ponownie za chwilę.';
      default:
        return 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.';
    }
  }

  return 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.';
};

/**
 * Wykonuje zapytanie z automatycznym retry przy błędach sieciowych
 */
export const apiWithRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Retry tylko dla błędów sieciowych, nie dla błędów HTTP (4xx, 5xx)
      if (!isNetworkError(error) || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt);
      console.log(`API retry attempt ${attempt + 1}/${maxRetries}, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
};

// Interceptor do dodawania tokena (jeśli potrzebny)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers = config.headers || {};
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
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
  async (error: AxiosError<ApiErrorResponse>) => {
    // Unified error format handling z przyjaznym komunikatem
    const friendlyMessage = getErrorMessage(error);
    const data = error.response?.data;

    const apiError = {
      status: 'error' as const,
      message: friendlyMessage,
      originalMessage: data?.message || error.message,
      code: data?.data?.code || data?.code || 'UNKNOWN_ERROR',
      details: data?.data?.details || data?.details || data,
      timestamp: data?.data?.timestamp || data?.timestamp || new Date().toISOString(),
      isNetworkError: isNetworkError(error),
    };

    // Attach unified error format to error object
    (error as unknown as { apiError: typeof apiError }).apiError = apiError;

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
