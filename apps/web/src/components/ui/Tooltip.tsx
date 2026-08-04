import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/** Lightweight hover/focus tooltip. Not for critical information — the
 * trigger must also carry its own aria-label or visible text. */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps): ReactNode {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs text-ink shadow-lg transition-opacity duration-150',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          visible ? 'opacity-100' : 'opacity-0',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
