import { cn } from '../../utils/cn';

interface SkeletonLoaderProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export default function SkeletonLoader({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded';

  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(baseClasses, 'h-4')}
            style={{
              width: i === lines - 1 ? '75%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  const variantClasses = {
    text: 'h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
      aria-label="Ładowanie..."
    />
  );
}
