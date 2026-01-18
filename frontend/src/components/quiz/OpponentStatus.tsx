import { User, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../../utils/cn';

type OpponentStatusType = 'waiting' | 'answering' | 'answered';

interface OpponentStatusProps {
  opponent?: { id: number; first_name?: string; last_name?: string; username?: string; email: string };
  status: OpponentStatusType;
  className?: string;
}

export default function OpponentStatus({ opponent, status, className = '' }: OpponentStatusProps) {
  if (!opponent) return null;

  const statusConfig: Record<OpponentStatusType, { icon: typeof Clock; text: string; color: string }> = {
    waiting: {
      icon: Clock,
      text: 'Oczekiwanie...',
      color: 'text-yellow-600',
    },
    answering: {
      icon: User,
      text: 'Przeciwnik odpowiada...',
      color: 'text-blue-600',
    },
    answered: {
      icon: CheckCircle2,
      text: 'Przeciwnik odpowiedział',
      color: 'text-green-600',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  const opponentName =
    opponent.first_name && opponent.last_name
      ? `${opponent.first_name} ${opponent.last_name}`
      : opponent.username || opponent.email;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg bg-white border-2 transition-all duration-300',
        status === 'waiting' && 'border-yellow-200 bg-yellow-50',
        status === 'answering' && 'border-blue-200 bg-blue-50',
        status === 'answered' && 'border-green-200 bg-green-50',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">
          {opponent.first_name?.[0] || opponent.email[0].toUpperCase()}
        </div>
        {status === 'answering' && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white animate-pulse" />
        )}
        {status === 'answered' && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-700">{opponentName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Icon className={cn('w-4 h-4', config.color, status === 'answering' && 'animate-pulse')} />
          <span className={cn('text-xs font-medium', config.color)}>{config.text}</span>
        </div>
      </div>
    </div>
  );
}
