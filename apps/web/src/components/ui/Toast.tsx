import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import type { Toast as ToastData, ToastLevel } from '../../store/uiStore';
import { cn } from '../../lib/cn';

const ICONS: Record<ToastLevel, ReactNode> = {
  info: <Info className="size-4" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4" aria-hidden="true" />,
  warning: <TriangleAlert className="size-4" aria-hidden="true" />,
  error: <XCircle className="size-4" aria-hidden="true" />,
};

const COLORS: Record<ToastLevel, string> = {
  info: 'border-info/30 text-info',
  success: 'border-success/30 text-success',
  warning: 'border-warning/30 text-warning',
  error: 'border-danger/30 text-danger',
};

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { toast: ToastData }): ReactNode {
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismissToast]);

  return (
    <div
      role="status"
      className={cn(
        'flex w-80 items-start gap-2.5 rounded-lg border bg-surface-2 p-3 shadow-xl',
        COLORS[toast.level],
      )}
    >
      {ICONS[toast.level]}
      <p className="flex-1 text-sm text-ink">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
        className="focus-ring text-ink-faint hover:text-ink"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastViewport(): ReactNode {
  const toasts = useUiStore((state) => state.toasts);
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}
