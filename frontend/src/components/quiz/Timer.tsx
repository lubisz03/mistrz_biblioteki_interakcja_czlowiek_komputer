import { useEffect, useState } from 'react';

interface TimerProps {
  seconds: number;
  onTimeout?: () => void;
  className?: string;
  isSynced?: boolean; // Jeśli true, timer jest synchronizowany z backendem i nie odlicza lokalnie
}

export default function Timer({ seconds, onTimeout, className = '', isSynced = false }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (isSynced) {
      // Timer jest synchronizowany z backendem - tylko sprawdzaj timeout
      if (timeLeft <= 0) {
        onTimeout?.();
      }
      return;
    }

    // Lokalny odliczanie
    if (timeLeft <= 0) {
      onTimeout?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onTimeout?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onTimeout, isSynced]);

  const minutes = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLowTime = timeLeft <= 10;

  return (
    <div className={`text-center ${className}`}>
      <div
        className={`text-3xl font-bold transition-colors duration-300 ${
          isLowTime ? 'text-red-600 animate-pulse' : 'text-primary'
        }`}
      >
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      {isLowTime && (
        <div className="text-xs text-red-600 mt-1">Czas się kończy!</div>
      )}
    </div>
  );
}
