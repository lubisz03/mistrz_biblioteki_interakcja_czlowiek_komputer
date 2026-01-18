import { cn } from '../../utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 border-2',
  md: 'w-12 h-12 border-4',
  lg: 'w-20 h-20 border-4',
};

export default function LoadingSpinner({ size = 'md', className = '', text }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn(
          'border-primary/20 border-t-primary rounded-full animate-spin',
          sizeClasses[size]
        )}
        role="status"
        aria-label="Ładowanie"
      >
        <span className="sr-only">Ładowanie...</span>
      </div>
      {text && <p className="text-gray-600 text-sm">{text}</p>}
    </div>
  );
}
