import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  id?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  id,
  className,
}: SwitchProps): ReactNode {
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'accent-gradient' : 'bg-surface-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow transition-transform duration-150',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );

  if (!label && !description) return control;

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex flex-col">
        {label && <span className="text-sm font-medium text-ink">{label}</span>}
        {description && <span className="text-xs text-ink-dim">{description}</span>}
      </span>
      {control}
    </label>
  );
}
