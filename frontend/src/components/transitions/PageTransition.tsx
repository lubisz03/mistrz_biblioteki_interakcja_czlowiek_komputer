import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation();

  return (
    <div
      key={location.pathname}
      className={cn('animate-fade-in', className)}
      style={{
        animation: 'fade-in 0.3s ease-out',
      }}
    >
      {children}
    </div>
  );
}
