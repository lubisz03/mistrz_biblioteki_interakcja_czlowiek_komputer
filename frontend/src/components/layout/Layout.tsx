import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import ActiveUsersSidebar from './ActiveUsersSidebar';
import MatchNotification from '../notifications/MatchNotification';
import ChallengeModal from '../modals/ChallengeModal';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import {
  connectNotificationSocket,
  getNotificationSocket,
  disconnectNotificationSocket,
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

  // Połącz z WebSocket powiadomień
  useEffect(() => {
    if (!user) return;

    const connectNotifications = async () => {
      try {
        // Pobierz token dla WebSocket
        const tokenResponse = await api.get('/auth/token/websocket/');
        const token = tokenResponse.data?.token;

        if (!token) {
          console.error('Cannot get token for notifications');
          return;
        }

        const socket = connectNotificationSocket(token);

        // Obsługa aktywnych użytkowników
        socket.on('active_users', (data: { users: User[] }) => {
          setActiveUsers(data.users || []);
        });

        socket.on('user:joined', (data: { user: User }) => {
          addActiveUser(data.user);
        });

        socket.on('user:left', (data: { user_id: number }) => {
          removeActiveUser(data.user_id);
        });

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

        socket.connect().catch((error) => {
          console.error('Notification socket connection error:', error);
        });
      } catch (error) {
        console.error('Error connecting notification socket:', error);
      }
    };

    connectNotifications();

    return () => {
      disconnectNotificationSocket();
    };
  }, [user, setActiveUsers, addActiveUser, removeActiveUser, addNotification, removeNotification, navigate]);

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
      <main className="flex-1 container mx-auto px-6 py-8">{children}</main>
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
    </div>
  );
}
