import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import ActiveUsersSidebar from './ActiveUsersSidebar';
import MatchNotification from '../notifications/MatchNotification';
import ChallengeModal from '../modals/ChallengeModal';
import ToastContainer from '../ui/ToastContainer';
import ConnectionStatus from '../ui/ConnectionStatus';
import PageTransition from '../transitions/PageTransition';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import {
  connectNotificationSocket,
  getNotificationSocket,
} from '../../services/notificationSocket';
import type { User } from '../../types/api';
import api from '../../services/api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeUsers,
    notifications,
    setActiveUsers,
    addActiveUser,
    removeActiveUser,
    addNotification,
    removeNotification,
  } = useNotificationStore();
  const [challengeOpponent, setChallengeOpponent] = useState<User | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Połącz z WebSocket powiadomień
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const connectNotifications = async () => {
      try {
        // Pobierz token dla WebSocket
        const tokenResponse = await api.get('/auth/token/websocket/');
        const token = tokenResponse.data?.token;

        if (!token) {
          console.error('Cannot get token for notifications');
          return;
        }

        // Sprawdź czy socket już istnieje i jest połączony
        let socket = getNotificationSocket();
        if (socket && socket.isConnected()) {
          console.log('Layout: Socket already exists and is connected, reusing it');
          // Usuń stare listenery przed dodaniem nowych (jeśli istnieją)
          // To zapobiega duplikatom listenerów
        } else {
          console.log('Layout: Creating new socket connection');
          socket = connectNotificationSocket(token);
        }

        // Zdefiniuj callbacki (muszą być funkcjami, żeby móc je usunąć później)
        const activeUsersHandler = (data: { type: string; users?: User[] }) => {
          console.log('Layout: Received active_users:', data);
          if (isMounted) {
            setActiveUsers(data.users || []);
          }
        };

        const userJoinedHandler = (data: { type: string; user?: User }) => {
          console.log('Layout: User joined:', data);
          if (isMounted && data.user) {
            addActiveUser(data.user);
          }
        };

        const userLeftHandler = (data: { type: string; user_id?: number }) => {
          console.log('Layout: User left:', data);
          if (isMounted && data.user_id) {
            removeActiveUser(data.user_id);
          }
        };

        // Usuń stare listenery (jeśli istnieją) przed dodaniem nowych
        // To zapobiega duplikatom
        socket.off('active_users', activeUsersHandler);
        socket.off('user:joined', userJoinedHandler);
        socket.off('user:left', userLeftHandler);

        // Zarejestruj nowe listenery
        socket.on('active_users', activeUsersHandler);
        socket.on('user:joined', userJoinedHandler);
        socket.on('user:left', userLeftHandler);

        // Obsługa powiadomień o meczach
        socket.on(
          'match:notification',
          (data: {
            match_id: number;
            player: User;
            book: { id: number; title: string; author: string };
            subject: { id: number; name: string; color: string };
            timeout?: number;
          }) => {
            addNotification({
              matchId: data.match_id,
              player: data.player,
              book: data.book,
              subject: data.subject,
              timeout: data.timeout || 60,
              type: 'match',
            });
          }
        );

        socket.on('match:accepted', (data: { match_id: number }) => {
          removeNotification(data.match_id);
          navigate(`/matchmaking/${data.match_id}`);
        });

        socket.on('match:declined', (data: { match_id: number }) => {
          removeNotification(data.match_id);
        });

        socket.on('match:timeout', (data: { match_id: number }) => {
          removeNotification(data.match_id);
        });

        // Obsługa zaproszeń
        socket.on(
          'invite:notification',
          (data: {
            match_id: number;
            player: User;
            book: { id: number; title: string; author: string };
            subject: { id: number; name: string; color: string };
            timeout?: number;
          }) => {
            addNotification({
              matchId: data.match_id,
              player: data.player,
              book: data.book,
              subject: data.subject,
              timeout: data.timeout || 60,
              type: 'invite',
            });
          }
        );

        socket.on('invite:accepted', (data: { match_id: number }) => {
          removeNotification(data.match_id);
          navigate(`/matchmaking/${data.match_id}`);
        });

        socket.on('invite:declined', (data: { match_id: number }) => {
          removeNotification(data.match_id);
        });

        socket.on('invite:timeout', (data: { match_id: number }) => {
          removeNotification(data.match_id);
        });

        // Połącz jeśli nie jest już połączony
        if (!socket.isConnected()) {
          socket.connect().then(() => {
            console.log('Layout: Notification socket connected, listeners registered');
          }).catch((error) => {
            console.error('Layout: Notification socket connection error:', error);
          });
        } else {
          console.log('Layout: Socket already connected, listeners registered');
        }

        // Zapisz cleanup funkcję
        cleanupRef.current = () => {
          isMounted = false;
          if (socket) {
            socket.off('active_users', activeUsersHandler);
            socket.off('user:joined', userJoinedHandler);
            socket.off('user:left', userLeftHandler);
          }
        };
      } catch (error) {
        console.error('Error connecting notification socket:', error);
      }
    };

    connectNotifications();

    return () => {
      isMounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [user?.id]); // Tylko user.id jako zależność - funkcje ze store są stabilne

  const handleChallenge = (userId: number) => {
    const opponentUser = activeUsers.find((u) => u.id === userId);
    if (opponentUser) {
      setChallengeOpponent(opponentUser);
    }
  };

  const handleAcceptMatch = (matchId: number) => {
    const socket = getNotificationSocket();
    if (socket) {
      socket.send('match:accept', { match_id: matchId });
    }
  };

  const handleDeclineMatch = (matchId: number) => {
    const socket = getNotificationSocket();
    if (socket) {
      socket.send('match:decline', { match_id: matchId });
    }
    removeNotification(matchId);
  };

  const handleAcceptInvite = (matchId: number) => {
    const socket = getNotificationSocket();
    if (socket) {
      socket.send('invite:accept', { match_id: matchId });
    }
  };

  const handleDeclineInvite = (matchId: number) => {
    const socket = getNotificationSocket();
    if (socket) {
      socket.send('invite:decline', { match_id: matchId });
    }
    removeNotification(matchId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      <main className="flex-1 container mx-auto px-6 py-8" role="main">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />

      {/* Active Users Sidebar */}
      {user && <ActiveUsersSidebar activeUsers={activeUsers} onChallenge={handleChallenge} />}

      {/* Notifications */}
      {notifications.map((notification) => (
        <MatchNotification
          key={notification.matchId}
          matchId={notification.matchId}
          player={notification.player}
          book={notification.book}
          subject={notification.subject}
          timeout={notification.timeout}
          onAccept={notification.type === 'match' ? handleAcceptMatch : handleAcceptInvite}
          onDecline={notification.type === 'match' ? handleDeclineMatch : handleDeclineInvite}
          onClose={() => removeNotification(notification.matchId)}
        />
      ))}

      {/* Challenge Modal */}
      {challengeOpponent && <ChallengeModal opponent={challengeOpponent} onClose={() => setChallengeOpponent(null)} />}

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Connection Status */}
      <ConnectionStatus />
    </div>
  );
}
