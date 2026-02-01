import { Wifi, WifiOff, Loader2, CloudOff } from 'lucide-react';
import { useConnectionStore, type ConnectionStatus as ConnStatus } from '../../store/connectionStore';
import { cn } from '../../utils/cn';

type DisplayStatus = ConnStatus | 'offline';

const statusConfig: Record<DisplayStatus, { icon: typeof Wifi; text: string; color: string; bgColor: string }> = {
  connected: {
    icon: Wifi,
    text: 'Połączono',
    color: 'text-green-600',
    bgColor: 'border-green-300',
  },
  connecting: {
    icon: Loader2,
    text: 'Łączenie...',
    color: 'text-yellow-600',
    bgColor: 'border-yellow-300',
  },
  disconnected: {
    icon: WifiOff,
    text: 'Rozłączono z serwerem',
    color: 'text-red-600',
    bgColor: 'border-red-300',
  },
  reconnecting: {
    icon: Loader2,
    text: 'Ponowne łączenie...',
    color: 'text-yellow-600',
    bgColor: 'border-yellow-300',
  },
  offline: {
    icon: CloudOff,
    text: 'Brak połączenia z internetem',
    color: 'text-red-700',
    bgColor: 'border-red-400 bg-red-50',
  },
};

export default function ConnectionStatus() {
  const { matchSocketStatus, notificationSocketStatus, isOnline } = useConnectionStore();
  const location = window.location.pathname;

  // Jeśli offline - zawsze pokaż
  if (!isOnline) {
    const config = statusConfig.offline;
    const Icon = config.icon;
    return (
      <div
        className={cn(
          'fixed bottom-4 left-4 z-50 bg-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 border-2',
          config.bgColor
        )}
        role="alert"
        aria-live="assertive"
      >
        <Icon className={cn('w-6 h-6', config.color)} />
        <div>
          <span className={cn('text-sm font-semibold block', config.color)}>{config.text}</span>
          <span className="text-xs text-gray-500">Sprawdź połączenie i spróbuj ponownie</span>
        </div>
      </div>
    );
  }

  // Sprawdź czy socket meczu jest aktualnie potrzebny (tylko na stronach quiz/matchmaking/ready)
  const isMatchSocketNeeded = location.includes('/quiz/') ||
                               location.includes('/matchmaking/') ||
                               location.includes('/ready/');

  // Pokaż najgorszy status (disconnected > reconnecting > connecting > connected)
  // Uwzględnij matchSocketStatus tylko jeśli socket meczu jest potrzebny
  const getWorstStatus = (): ConnStatus => {
    // Zawsze sprawdzaj notificationSocketStatus (zawsze potrzebny)
    const statuses: ConnStatus[] = [notificationSocketStatus];

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
        config.bgColor
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
