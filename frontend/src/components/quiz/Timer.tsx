import { useEffect, useState } from 'react';

interface TimerProps {
  seconds: number;
  onTimeout?: () => void;
  className?: string;
}

export default function Timer({ seconds, onTimeout, className = '' }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
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
  }, [timeLeft, onTimeout]);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  const minutes = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const isLowTime = timeLeft <= 10;

  return (
    <div className={`text-center ${className}`}>
      <div className={`text-3xl font-bold ${isLowTime ? 'text-red-600' : 'text-primary'}`}>
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
    </div>
  );
}
