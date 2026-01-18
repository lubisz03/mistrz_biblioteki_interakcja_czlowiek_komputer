import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useConnectionStore, type ConnectionStatus } from '../../store/connectionStore';
import { cn } from '../../utils/cn';

const statusConfig: Record<ConnectionStatus, { icon: typeof Wifi; text: string; color: string }> = {
  connected: {
    icon: Wifi,
    text: 'Połączono',
    color: 'text-green-600',
  },
  connecting: {
    icon: Loader2,
    text: 'Łączenie...',
    color: 'text-yellow-600',
  },
  disconnected: {
    icon: WifiOff,
    text: 'Rozłączono',
    color: 'text-red-600',
  },
  reconnecting: {
    icon: Loader2,
    text: 'Ponowne łączenie...',
    color: 'text-yellow-600',
  },
};

export default function ConnectionStatus() {
  const { matchSocketStatus, notificationSocketStatus } = useConnectionStore();
  const location = window.location.pathname;

  // Sprawdź czy socket meczu jest aktualnie potrzebny (tylko na stronach quiz/matchmaking/ready)
  const isMatchSocketNeeded = location.includes('/quiz/') ||
                               location.includes('/matchmaking/') ||
                               location.includes('/ready/');

  // Pokaż najgorszy status (disconnected > reconnecting > connecting > connected)
  // Uwzględnij matchSocketStatus tylko jeśli socket meczu jest potrzebny
  const getWorstStatus = (): ConnectionStatus => {
    // Zawsze sprawdzaj notificationSocketStatus (zawsze potrzebny)
    const statuses: ConnectionStatus[] = [notificationSocketStatus];

    // Dodaj matchSocketStatus tylko jeśli jest potrzebny
    if (isMatchSocketNeeded) {
      statuses.push(matchSocketStatus);
    }

    if (statuses.includes('disconnected')) {
      return 'disconnected';
    }
    if (statuses.includes('reconnecting')) {
      return 'reconnecting';
    }
    if (statuses.includes('connecting')) {
      return 'connecting';
    }
    return 'connected';
  };

  const status = getWorstStatus();
  const config = statusConfig[status];
  const Icon = config.icon;

  if (status === 'connected') {
    return null; // Nie pokazuj gdy wszystko OK
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 border-2',
        status === 'disconnected' && 'border-red-300',
        status === 'reconnecting' && 'border-yellow-300',
        status === 'connecting' && 'border-yellow-300'
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn('w-5 h-5', config.color, status === 'connecting' || status === 'reconnecting' ? 'animate-spin' : '')}
      />
      <span className={cn('text-sm font-medium', config.color)}>{config.text}</span>
    </div>
  );
}
