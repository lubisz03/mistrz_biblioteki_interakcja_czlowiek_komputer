import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import { connectSocket, getSocket } from '../services/socket';
import { getAuthToken } from '../services/auth';

export default function Ready() {
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();

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

    const token = getAuthToken();
    if (!token) {
      navigate('/');
      return;
    }

    const socket = connectSocket(parseInt(matchId), token);

    socket.on('match:start', () => {
      // Mecz się rozpoczął - przejdź do quizu
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
  }, [matchId, navigate]);

  const handleReady = () => {
    const socket = getSocket();
    if (socket) {
      socket.send('match:ready');
      // Przejdź do quizu - mecz powinien się już startować
      if (matchId) {
        navigate(`/quiz/${matchId}`);
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

        <div className="mb-8">
          <p className="text-2xl text-gray-700 mb-2">10 pytań</p>
          <p className="text-xl text-gray-600 mb-8">Czy jesteś gotowy?</p>
        </div>

        <div className="flex gap-6 justify-center">
          <Button
            variant="success"
            size="lg"
            onClick={handleReady}
            className="px-12 py-4 text-xl"
          >
            TAK
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
      </div>
    </Layout>
  );
}
