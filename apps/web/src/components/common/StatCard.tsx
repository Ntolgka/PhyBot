import type { ComponentType, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  hint?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'neutral',
}: StatCardProps): ReactNode {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
        <Icon className="size-4 text-ink-faint" aria-hidden="true" />
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', toneClasses[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-dim">{hint}</p>}
    </div>
  );
}
