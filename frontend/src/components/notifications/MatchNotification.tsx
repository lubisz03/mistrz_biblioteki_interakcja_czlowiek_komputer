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
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl px-4">
      <div className="animate-modal-in">
      <Card className="shadow-2xl border-2 border-primary/20">
        <div className="p-8">
          {/* Header with close button */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1 min-w-0 pr-4">
              <h3 className="font-bold text-2xl text-primary mb-3 flex items-center gap-3">
                <span className="w-4 h-4 bg-green-500 rounded-full animate-pulse flex-shrink-0"></span>
                Zaproszenie do gry!
              </h3>
              <p className="text-lg text-gray-700">
                <span className="font-semibold text-primary">
                  {player.first_name && player.last_name
                    ? `${player.first_name} ${player.last_name}`
                    : player.username || player.email}
                </span>{' '}
                chce zagrać z Tobą!
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Book and subject info */}
          <div className="mb-6 p-5 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg border border-primary/10">
            <p className="text-lg font-semibold text-gray-800 mb-2 break-words">{book.title}</p>
            <p className="text-base text-gray-600 mb-4 break-words">{book.author}</p>
            <div className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded shadow-sm flex-shrink-0"
                style={{ backgroundColor: subject.color }}
              />
              <span className="text-base font-medium text-gray-700">{subject.name}</span>
            </div>
          </div>

          {/* Ranking info */}
          {player.best_ranking && (
            <div className="mb-6 text-base text-gray-600 bg-gray-50 p-3 rounded">
              <span className="font-semibold">Ranking przeciwnika:</span>{' '}
              <span className="font-bold text-primary">{player.best_ranking.points} pkt</span>
              {' '}({player.best_ranking.subject})
            </div>
          )}

          {/* Timer and actions */}
          <div className="flex items-center justify-between pt-5 border-t border-gray-200 gap-4">
            <div className="flex items-center gap-3 text-base">
              <span className="text-gray-600">Pozostało:</span>
              <span className="font-bold text-2xl text-primary">{timeLeft}s</span>
            </div>
            <div className="flex gap-4 flex-shrink-0">
              <Button
                variant="danger"
                size="md"
                onClick={() => onDecline(matchId)}
                className="flex items-center gap-2 px-6 py-2"
              >
                <XCircle className="w-5 h-5" />
                Odrzuć
              </Button>
              <Button
                variant="success"
                size="md"
                onClick={() => onAccept(matchId)}
                className="flex items-center gap-2 px-6 py-2"
              >
                <Check className="w-5 h-5" />
                Akceptuj
              </Button>
            </div>
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}
