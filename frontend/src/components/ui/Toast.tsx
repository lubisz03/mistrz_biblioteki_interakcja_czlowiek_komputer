import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, type Toast, type ToastType } from '../../store/toastStore';

interface ToastProps {
  toast: Toast;
}

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const bgColorMap: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-yellow-50 border-yellow-200',
  info: 'bg-blue-50 border-blue-200',
};

const textColorMap: Record<ToastType, string> = {
  success: 'text-green-800',
  error: 'text-red-800',
  warning: 'text-yellow-800',
  info: 'text-blue-800',
};

export default function Toast({ toast }: ToastProps) {
  const { removeToast } = useToastStore();
  const Icon = iconMap[toast.type];

  return (
    <div
      className={`${bgColorMap[toast.type]} border-2 rounded-lg shadow-lg p-4 min-w-[300px] max-w-md animate-slide-up mb-3`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-6 h-6 ${textColorMap[toast.type]} flex-shrink-0 mt-0.5`} />
        <p className={`flex-1 ${textColorMap[toast.type]} font-medium`}>{toast.message}</p>
        <button
          onClick={() => removeToast(toast.id)}
          className={`${textColorMap[toast.type]} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Zamknij powiadomienie"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
