import { useEffect, useState } from 'react';
import { X, Check, XCircle } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import type { User } from '../../types/api';

interface MatchNotificationProps {
  matchId: number;
  player: User;
  book: { id: number; title: string; author: string };
  subject: { id: number; name: string; color: string };
  timeout: number;
  onAccept: (matchId: number) => void;
  onDecline: (matchId: number) => void;
  onClose: () => void;
}

export default function MatchNotification({
  matchId,
  player,
  book,
  subject,
  timeout,
  onAccept,
  onDecline,
  onClose,
}: MatchNotificationProps) {
  const [timeLeft, setTimeLeft] = useState(timeout);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline(matchId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [matchId, onDecline]);

  return (
    <Card className="fixed top-4 right-4 w-96 z-50 shadow-2xl animate-slide-in">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-bold text-lg text-primary mb-1">Możliwość gry!</h3>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">
                {player.first_name && player.last_name
                  ? `${player.first_name} ${player.last_name}`
                  : player.username || player.email}
              </span>{' '}
              chce zagrać z Tobą!
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm font-semibold text-gray-800 mb-1">{book.title}</p>
          <p className="text-xs text-gray-600">{book.author}</p>
          <div className="mt-2 flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: subject.color }}
            />
            <span className="text-xs text-gray-600">{subject.name}</span>
          </div>
        </div>

        {player.best_ranking && (
          <div className="mb-3 text-xs text-gray-600">
            Ranking: {player.best_ranking.points} pkt ({player.best_ranking.subject})
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Pozostało: <span className="font-bold text-primary">{timeLeft}s</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={() => onAccept(matchId)}
              className="flex items-center gap-1"
            >
              <Check className="w-4 h-4" />
              Akceptuj
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDecline(matchId)}
              className="flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              Odrzuć
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
