import type { ReactNode } from 'react';
import type { EventRsvp, RsvpStatus } from '@phybot/shared';
import { RSVP_STATUSES } from '@phybot/shared';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDateTime } from '../../lib/format';

const STATUS_LABEL: Record<RsvpStatus, string> = {
  going: 'Going',
  maybe: 'Maybe',
  declined: 'Declined',
};

const STATUS_VARIANT: Record<RsvpStatus, 'success' | 'warning' | 'danger'> = {
  going: 'success',
  maybe: 'warning',
  declined: 'danger',
};

export function AttendeeList({ rsvps }: { rsvps: EventRsvp[] }): ReactNode {
  if (rsvps.length === 0) {
    return (
      <EmptyState
        title="No responses yet"
        description="Attendees will appear here once they RSVP."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {RSVP_STATUSES.map((status) => {
        const members = rsvps.filter((rsvp) => rsvp.status === status);
        if (members.length === 0) return null;
        return (
          <div key={status}>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
              <span className="text-xs text-ink-faint">{members.length}</span>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate text-ink">{member.displayName}</span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatDateTime(member.respondedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
