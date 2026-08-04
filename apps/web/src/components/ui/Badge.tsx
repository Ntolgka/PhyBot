import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-3 text-ink-dim border-border-strong',
  accent: 'bg-accent-2/15 text-accent-3 border-accent-2/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-info/15 text-info border-info/30',
};

export function Badge({
  className,
  variant = 'neutral',
  icon,
  children,
  ...props
}: BadgeProps): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
