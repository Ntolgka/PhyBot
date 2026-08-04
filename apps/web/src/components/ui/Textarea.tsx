import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, containerClassName, label, hint, error, id, rows = 4, ...props },
  ref,
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const hintId = `${areaId}-hint`;
  const errorId = `${areaId}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={areaId} className="text-sm font-medium text-ink-dim">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          'focus-ring w-full resize-y rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-danger/60',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
