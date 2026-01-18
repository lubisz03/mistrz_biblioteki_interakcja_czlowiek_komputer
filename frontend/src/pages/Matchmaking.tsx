import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import ProgressBar from '../components/ui/ProgressBar';
import Button from '../components/ui/Button';
import { connectSocket, disconnectSocket } from '../services/socket';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { useToastStore } from '../store/toastStore';
import { logger } from '../utils/logger';
import type { Match } from '../types/api';

export default function Matchmaking() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { activeUsers } = useNotificationStore();
  const { showToast } = useToastStore();
  const [status, setStatus] = useState<'searching' | 'waiting' | 'found' | 'accepted' | 'declined'>('searching');

  const { data: match } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const response = await api.get(`/quiz/matches/${matchId}/`);
      return response.data;
    },
    enabled: !!matchId,
  });

  useEffect(() => {
    if (!matchId) {
      navigate('/');
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    // Pobierz token przez API endpoint
    const fetchTokenForWebSocket = async () => {
      try {
        const tokenResponse = await api.get('/auth/token/websocket/');
        const token = tokenResponse.data?.token;

        if (!token) {
          logger.error('Matchmaking: No token received from API');
          return;
        }

        const socket = connectSocket(parseInt(matchId), token);

        socket.on('match:found', () => {
          logger.debug('Matchmaking: Received match:found');
          setStatus('found');
        });

        socket.on('match:accepted', () => {
          logger.debug('Matchmaking: Received match:accepted');
          setStatus('accepted');
          showToast('success', 'Przeciwnik zaakceptował mecz!');
        });

        socket.on('match:declined', () => {
          logger.debug('Matchmaking: Received match:declined');
          setStatus('declined');
          showToast('warning', 'Przeciwnik odrzucił mecz');
          setTimeout(() => navigate('/'), 2000);
        });

        socket.on('match:start', (data: { data?: unknown }) => {
          logger.debug('Matchmaking: Received match:start', data);
          // Mecz się rozpoczął - przejdź do quizu
          navigate(`/quiz/${matchId}`);
        });

        socket.connect().catch((error) => {
          logger.error('WebSocket connection error:', error);
        });

        return () => {
          // Nie rozłączaj socketu - może być potrzebny w quizie
        };
      } catch (error) {
        if (logger) logger.error('Matchmaking: Error connecting socket:', error);
      }
    };

    fetchTokenForWebSocket();
  }, [matchId, navigate, user, showToast]);

  const handleCancel = () => {
    disconnectSocket();
    navigate('/');
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold text-primary mb-4">{match?.book?.title || 'Ładowanie...'}</h1>
          <p className="text-gray-600 text-lg">{match?.book?.author || ''}</p>
        </div>

        <div className="mb-8">
          <ProgressBar
            current={
              status === 'searching' ? 30 : status === 'found' ? 60 : status === 'accepted' ? 90 : 100
            }
            total={100}
          />
        </div>

        {/* Status Display */}
        <div className="mb-8">
          {status === 'searching' && (
            <div className="animate-pulse">
              <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Oczekiwanie...</h2>
              <p className="text-gray-600">
                Aktywnych graczy: <span className="font-bold text-primary">{activeUsers.length}</span>
              </p>
            </div>
          )}

          {status === 'found' && (
            <div className="animate-scale-in">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Przeciwnik znaleziony!</h2>
              <p className="text-gray-600">Oczekiwanie na akceptację...</p>
            </div>
          )}

          {status === 'accepted' && (
            <div className="animate-bounce-in">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-semibold text-green-600 mb-2">Mecz zaakceptowany!</h2>
              <p className="text-gray-600">Rozpoczynamy quiz...</p>
            </div>
          )}

          {status === 'declined' && (
            <div className="animate-shake">
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-red-600 mb-2">Mecz odrzucony</h2>
              <p className="text-gray-600">Wracamy do strony głównej...</p>
            </div>
          )}
        </div>

        {/* Opponent Info */}
        {match && status !== 'declined' && (() => {
          // Określ przeciwnika na podstawie tego, który gracz jest zalogowany
          const opponent = user?.id === match.player1?.id ? match.player2 : match.player1;

          if (!opponent) return null;

          return (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200 animate-fade-in">
              <p className="text-sm text-gray-600 mb-1">Przeciwnik:</p>
              <p className="text-lg font-semibold text-gray-800">
                {opponent.first_name && opponent.last_name
                  ? `${opponent.first_name} ${opponent.last_name}`
                  : opponent.username || opponent.email}
              </p>
            </div>
          );
        })()}

        {/* Cancel Button */}
        {status !== 'accepted' && status !== 'declined' && (
          <Button variant="secondary" onClick={handleCancel}>
            Anuluj
          </Button>
        )}
      </div>
    </Layout>
  );
}
