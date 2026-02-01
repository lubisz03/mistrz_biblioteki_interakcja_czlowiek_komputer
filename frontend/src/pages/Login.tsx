import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

interface LocationState {
  from?: {
    pathname: string;
  };
}

export default function Login() {
  const location = useLocation();
  const { setUser } = useAuthStore();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as LocationState)?.from?.pathname || '/';

  const loginMutation = useMutation({
    mutationFn: async (data: { login: string; password: string; remember_me: boolean }) => {
      const response = await api.post('/auth/login/', data);
      // Interceptor już rozpakował response.data.data -> response.data
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Login success, data:', data);
      // Po rozpakowaniu, user powinien być bezpośrednio w data
      if (data.user) {
        console.log('Setting user and navigating to:', from);
        if (data.access_token) {
          localStorage.setItem('access_token', data.access_token);
        }
        setUser(data.user);
        // Używamy window.location.href aby wymusić pełne przeładowanie
        // i uniknąć konfliktów między PublicRoute a ProtectedRoute
        // Małe opóźnienie zapewnia, że cookies są ustawione
        setTimeout(() => {
          window.location.href = from;
        }, 50);
      } else {
        console.error('No user in response:', data);
        setError('Błąd logowania: brak danych użytkownika');
      }
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string; error?: string } } };
      setError(
        apiError.response?.data?.message ||
          apiError.response?.data?.error ||
          'Błąd logowania. Sprawdź dane i spróbuj ponownie.'
      );
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!login || !password) {
      setError('Wypełnij wszystkie pola');
      return;
    }

    loginMutation.mutate({
      login,
      password,
      remember_me: rememberMe,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md">
        <Card className="p-8">
          <div className="text-center mb-8">
            <div className="bg-accent w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
              PŁ
            </div>
            <h1 className="text-3xl font-bold text-primary mb-2">Mistrz Zasobów Biblioteki PŁ</h1>
            <p className="text-gray-600">Zaloguj się do konta</p>
          </div>

          {error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
                Email lub nazwa użytkownika
              </label>
              <input
                id="login"
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="email@example.com"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Hasło
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
                Zapamiętaj mnie
              </label>
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Logowanie...' : 'Zaloguj się'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600">
            Nie masz konta?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Zarejestruj się
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
