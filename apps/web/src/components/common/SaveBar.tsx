import type { ReactNode } from 'react';
import { Button } from '../ui/Button';

export interface SaveBarProps {
  visible: boolean;
  pending?: boolean;
  onSave: () => void;
  onReset: () => void;
  message?: string;
}

export function SaveBar({
  visible,
  pending,
  onSave,
  onReset,
  message = 'You have unsaved changes',
}: SaveBarProps): ReactNode {
  if (!visible) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex items-center justify-between gap-4 rounded-lg border border-border-strong bg-surface-2/95 px-4 py-3 shadow-2xl backdrop-blur">
      <p className="text-sm text-ink-dim">{message}</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onReset} disabled={pending}>
          Reset
        </Button>
        <Button variant="primary" onClick={onSave} pending={pending}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
