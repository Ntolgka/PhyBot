import type { ReactNode } from 'react';
import type { LogEntry } from '@phybot/shared';
import { Badge } from '../ui/Badge';
import type { BadgeVariant } from '../ui/Badge';

const LEVEL_VARIANT: Record<LogEntry['level'], BadgeVariant> = {
  trace: 'neutral',
  debug: 'neutral',
  info: 'info',
  warn: 'warning',
  error: 'danger',
  fatal: 'danger',
};

export function LogLevelBadge({ level }: { level: LogEntry['level'] }): ReactNode {
  return <Badge variant={LEVEL_VARIANT[level]}>{level.toUpperCase()}</Badge>;
}
