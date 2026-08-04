import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  valueLabel?: string;
  className?: string;
  'aria-label'?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled,
  label,
  valueLabel,
  className,
  ...aria
}: SliderProps): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between text-xs text-ink-dim">
          {label && <span>{label}</span>}
          {valueLabel && <span className="tabular-nums text-ink-faint">{valueLabel}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="focus-ring w-full disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={aria['aria-label'] ?? label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      />
    </div>
  );
}
