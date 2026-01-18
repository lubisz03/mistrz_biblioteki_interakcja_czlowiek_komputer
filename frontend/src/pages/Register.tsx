import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function Register() {
  const navigate = useNavigate();
  const { setUser, fetchUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');

  const registerMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      repeat_password: string;
      first_name?: string;
      last_name?: string;
    }) => {
      const response = await api.post('/auth/register/', data);
      // Interceptor już rozpakował response.data.data -> response.data
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.user) {
        setUser(data.user);
        await fetchUser();
        navigate('/', { replace: true });
      }
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string; error?: string; email?: string[] } } };
      setError(
        apiError.response?.data?.email?.[0] ||
          apiError.response?.data?.message ||
          apiError.response?.data?.error ||
          'Błąd rejestracji. Sprawdź dane i spróbuj ponownie.'
      );
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password || !repeatPassword) {
      setError('Wypełnij wszystkie wymagane pola');
      return;
    }

    if (password !== repeatPassword) {
      setError('Hasła nie są identyczne');
      return;
    }

    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków');
      return;
    }

    // Walidacja emaila po stronie frontendu (dodatkowa)
    const emailRegex = /^[^@]+@(edu\.)?p\.lodz\.pl$/;
    if (!emailRegex.test(email)) {
      setError('Email musi być z domeny @p.lodz.pl lub @edu.p.lodz.pl');
      return;
    }

    registerMutation.mutate({
      email,
      password,
      repeat_password: repeatPassword,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
    });
  };

  // Wyciągnij indeks z emaila (część przed @)
  const getIndexFromEmail = (email: string): string => {
    return email.split('@')[0];
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
            <p className="text-gray-600">Utwórz nowe konto</p>
          </div>

          {error && <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (indeks@p.lodz.pl lub indeks@edu.p.lodz.pl) *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="indeks@p.lodz.pl"
                autoComplete="email"
                required
              />
              {email && email.includes('@') && (
                <p className="mt-1 text-xs text-gray-500">Indeks: {getIndexFromEmail(email)}</p>
              )}
            </div>

            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                Imię
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Jan"
                autoComplete="given-name"
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Nazwisko
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Kowalski"
                autoComplete="family-name"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Hasło *
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div>
              <label htmlFor="repeatPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Powtórz hasło *
              </label>
              <input
                id="repeatPassword"
                type="password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Rejestracja...' : 'Zarejestruj się'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Masz już konto?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Zaloguj się
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
