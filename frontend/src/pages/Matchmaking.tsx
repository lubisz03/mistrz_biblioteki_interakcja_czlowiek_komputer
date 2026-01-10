import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import ProgressBar from '../components/ui/ProgressBar';
import { connectSocket, getSocket } from '../services/socket';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { Match } from '../types/api';

export default function Matchmaking() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'searching' | 'waiting'>('searching');

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
          console.error('Matchmaking: No token received from API');
          return;
        }

        const socket = connectSocket(parseInt(matchId), token);

        socket.on('match:found', () => {
          setStatus('waiting');
        });

        socket.on('match:start', () => {
          navigate(`/quiz/${matchId}`);
        });

        socket.connect().catch((error) => {
          console.error('WebSocket connection error:', error);
        });

        return () => {
          const currentSocket = getSocket();
          if (currentSocket) {
            currentSocket.disconnect();
          }
        };
      } catch (error) {
        console.error('Matchmaking: Error connecting socket:', error);
      }
    };

    fetchTokenForWebSocket();
  }, [matchId, navigate, user]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-4">{match?.book?.title || 'Ładowanie...'}</h1>
          <p className="text-gray-600 text-lg">{match?.book?.author || ''}</p>
        </div>

        <div className="mb-8">
          <ProgressBar current={status === 'searching' ? 30 : 60} total={100} />
        </div>

        <div className="text-2xl text-gray-700">
          {status === 'searching' ? 'Wyszukiwanie przeciwnika...' : 'Oczekiwanie na przeciwnika...'}
        </div>
      </div>
    </Layout>
  );
}
