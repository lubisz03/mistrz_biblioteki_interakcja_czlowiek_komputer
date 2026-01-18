import type { ButtonHTMLAttributes, ReactNode } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { cn } from '../../utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading = false,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = 'rounded-lg font-medium transition-all duration-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary/90 focus:ring-primary',
    secondary: 'bg-secondary text-white hover:bg-secondary/90 focus:ring-secondary',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <LoadingSpinner size="sm" />
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
