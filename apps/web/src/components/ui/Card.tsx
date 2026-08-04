import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}

export function Card({
  className,
  title,
  description,
  actions,
  padded = true,
  children,
  ...props
}: CardProps): ReactNode {
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <div className={cn('flex items-start justify-between gap-4', padded ? 'mb-4' : 'p-5 pb-4')}>
          <div className="min-w-0">
            {title !== undefined && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description !== undefined && (
              <p className="mt-1 text-sm text-ink-dim">{description}</p>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
