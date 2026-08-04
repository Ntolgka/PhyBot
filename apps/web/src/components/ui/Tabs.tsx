import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps): ReactNode {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-border', className)}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            id={`tab-${item.value}`}
            aria-controls={`tabpanel-${item.value}`}
            onClick={() => onChange(item.value)}
            className={cn(
              'focus-ring relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors duration-150',
              selected ? 'text-ink' : 'text-ink-dim hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
            {selected && (
              <span className="accent-gradient absolute inset-x-0 -bottom-px h-0.5 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  value,
  activeValue,
  children,
}: {
  value: string;
  activeValue: string;
  children: ReactNode;
}): ReactNode {
  if (value !== activeValue) return null;
  return (
    <div role="tabpanel" id={`tabpanel-${value}`} aria-labelledby={`tab-${value}`}>
      {children}
    </div>
  );
}
