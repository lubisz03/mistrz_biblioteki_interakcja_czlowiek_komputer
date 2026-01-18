import { useToastStore } from '../../store/toastStore';
import Toast from './Toast';

export default function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col items-end"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.slice(0, 5).map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
