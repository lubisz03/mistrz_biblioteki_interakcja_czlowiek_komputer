import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  const baseClasses = 'bg-white rounded-lg shadow-md p-6 transition-all duration-200';
  const interactiveClasses = onClick ? 'cursor-pointer hover:shadow-lg hover:scale-105' : '';

  return (
    <div
      className={`${baseClasses} ${interactiveClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
