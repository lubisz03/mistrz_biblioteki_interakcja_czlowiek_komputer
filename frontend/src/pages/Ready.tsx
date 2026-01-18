import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import { connectSocket, getSocket } from '../services/socket';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { logger } from '../utils/logger';
import type { Match } from '../types/api';

export default function Ready() {
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();
  const { user } = useAuthStore();
  const [player1Ready, setPlayer1Ready] = useState(false);
  const [player2Ready, setPlayer2Ready] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const { data: match } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const response = await api.get(`/quiz/matches/${matchId}/`);
      return response.data;
    },
    enabled: !!matchId,
  });

  useEffect(() => {
    if (!matchId) return;

    const fetchTokenAndConnect = async () => {
      try {
        const tokenResponse = await api.get('/auth/token/websocket/');
        const token = tokenResponse.data?.token;

        if (!token) {
          logger.error('Ready: No token received from API');
          navigate('/');
          return;
        }

        const socket = connectSocket(parseInt(matchId), token);

        socket.on('match:start', (data: { data?: any }) => {
          logger.debug('Ready: Received match:start', data);
          // Countdown przed startem
          setCountdown(3);
          const countdownInterval = setInterval(() => {
            setCountdown((prev) => {
              if (prev === null || prev <= 1) {
                clearInterval(countdownInterval);
                navigate(`/quiz/${matchId}`);
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        });

        socket.on('match:ready', (data: { user_id?: number }) => {
          if (data.user_id === match?.player1?.id) {
            setPlayer1Ready(true);
          } else if (data.user_id === match?.player2?.id) {
            setPlayer2Ready(true);
          }
        });

        socket.connect().catch((error) => {
          logger.error('WebSocket connection error:', error);
        });

        return () => {
          const currentSocket = getSocket();
          if (currentSocket) {
            currentSocket.disconnect();
          }
        };
      } catch (error) {
        logger.error('Ready: Error connecting socket:', error);
        navigate('/');
      }
    };

    fetchTokenAndConnect();
  }, [matchId, navigate]);

  const handleReady = () => {
    const socket = getSocket();
    if (socket) {
      socket.send('match:ready');
      // Oznacz siebie jako gotowego
      if (user?.id === match?.player1?.id) {
        setPlayer1Ready(true);
      } else if (user?.id === match?.player2?.id) {
        setPlayer2Ready(true);
      }
    }
  };

  const handleNotReady = () => {
    navigate(-1);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-4">
            {match?.book?.title || 'Ładowanie...'}
          </h1>
          <p className="text-gray-600 text-lg">
            {match?.book?.author || ''}
          </p>
        </div>

        <div className="mb-8">
          <ProgressBar current={0} total={1} />
        </div>

        {countdown !== null ? (
          <div className="mb-8 animate-bounce-in">
            <div className="text-8xl font-bold text-primary mb-4">{countdown}</div>
            <p className="text-2xl text-gray-700">Quiz rozpocznie się za...</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-2xl text-gray-700 mb-2">{match?.total_questions || 10} pytań</p>
              <p className="text-xl text-gray-600 mb-8">Czy jesteś gotowy?</p>
            </div>

            {/* Status gotowości graczy */}
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-center gap-4">
                {/* Wyświetl siebie i przeciwnika */}
                {(() => {
                  const currentPlayer = user?.id === match?.player1?.id ? match?.player1 : match?.player2;
                  const opponent = user?.id === match?.player1?.id ? match?.player2 : match?.player1;
                  const currentPlayerReady = user?.id === match?.player1?.id ? player1Ready : player2Ready;
                  const opponentReady = user?.id === match?.player1?.id ? player2Ready : player1Ready;

                  return (
                    <>
                      <div className={`flex items-center gap-2 p-3 rounded-lg ${currentPlayerReady ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100 border-2 border-gray-300'}`}>
                        {currentPlayerReady ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        ) : (
                          <Clock className="w-6 h-6 text-gray-400" />
                        )}
                        <span className="font-semibold">
                          {currentPlayer?.first_name && currentPlayer?.last_name
                            ? `${currentPlayer.first_name} ${currentPlayer.last_name}`
                            : currentPlayer?.username || currentPlayer?.email || 'Ty'}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">(Ty)</span>
                      </div>
                      {opponent && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg ${opponentReady ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100 border-2 border-gray-300'}`}>
                          {opponentReady ? (
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                          ) : (
                            <Clock className="w-6 h-6 text-gray-400" />
                          )}
                          <span className="font-semibold">
                            {opponent.first_name && opponent.last_name
                              ? `${opponent.first_name} ${opponent.last_name}`
                              : opponent.username || opponent.email || 'Przeciwnik'}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              {player1Ready && player2Ready && (
                <p className="text-green-600 font-semibold animate-pulse">Oba gracze są gotowi! Rozpoczynamy...</p>
              )}
            </div>

            <div className="flex gap-6 justify-center">
              <Button
                variant="success"
                size="lg"
                onClick={handleReady}
                disabled={user?.id === match?.player1?.id ? player1Ready : player2Ready}
                className="px-12 py-4 text-xl"
              >
                {user?.id === match?.player1?.id ? (player1Ready ? 'Gotowy!' : 'TAK') : (player2Ready ? 'Gotowy!' : 'TAK')}
              </Button>
              <Button
                variant="danger"
                size="lg"
                onClick={handleNotReady}
                className="px-12 py-4 text-xl"
              >
                NIE
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
