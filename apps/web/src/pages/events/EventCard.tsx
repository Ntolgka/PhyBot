import type { ReactNode } from 'react';
import type { GuildEvent } from '@phybot/shared';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../lib/cn';

export function EventCard({
  event,
  onClick,
}: {
  event: GuildEvent;
  onClick: () => void;
}): ReactNode {
  const goingCount = event.rsvps.filter((rsvp) => rsvp.status === 'going').length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2',
        event.cancelled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-ink">{event.title}</h3>
        {event.cancelled ? (
          <Badge variant="danger">Cancelled</Badge>
        ) : event.messageId ? (
          <Badge variant="success">Published</Badge>
        ) : (
          <Badge variant="neutral">Draft</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatDateTime(event.startsAt)}
        </span>
        {event.location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            {event.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {goingCount}
          {event.capacity > 0 ? ` / ${event.capacity}` : ''} going
        </span>
      </div>
    </button>
  );
}
