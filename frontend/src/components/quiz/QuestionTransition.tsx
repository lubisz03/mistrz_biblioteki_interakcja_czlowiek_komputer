import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface QuestionTransitionProps {
  children: ReactNode;
  key: string | number;
  className?: string;
}

export default function QuestionTransition({ children, key, className = '' }: QuestionTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Reset animation when key changes
    setIsExiting(true);
    const exitTimer = setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      // Small delay before showing new question
      setTimeout(() => {
        setIsVisible(true);
      }, 50);
    }, 300);

    return () => clearTimeout(exitTimer);
  }, [key]);

  useEffect(() => {
    // Initial show
    setIsVisible(true);
  }, []);

  return (
    <div
      className={cn(
        'transition-all duration-300',
        isExiting && 'animate-slide-out opacity-0',
        isVisible && !isExiting && 'animate-slide-in opacity-100',
        className
      )}
    >
      {children}
    </div>
  );
}
