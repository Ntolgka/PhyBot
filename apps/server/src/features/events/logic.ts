import type { EventRsvp, GuildEvent, RsvpStatus } from '@phybot/shared';

/**
 * True when recording `status` for `userId` would push the "going" list past
 * the event's capacity. Capacity 0 means unlimited. A user already marked as
 * going is exempt, since re-confirming their own spot never adds anyone new.
 */
export function wouldExceedCapacity(
  event: GuildEvent,
  userId: string,
  status: RsvpStatus,
): boolean {
  if (status !== 'going' || event.capacity <= 0) return false;
  const alreadyGoing = event.rsvps.some(
    (rsvp) => rsvp.userId === userId && rsvp.status === 'going',
  );
  if (alreadyGoing) return false;
  const goingCount = event.rsvps.filter((rsvp) => rsvp.status === 'going').length;
  return goingCount >= event.capacity;
}

export function rsvpsByStatus(rsvps: readonly EventRsvp[], status: RsvpStatus): EventRsvp[] {
  return rsvps.filter((rsvp) => rsvp.status === status);
}

/** Renders a status group as a comma separated list, truncating long ones. */
export function formatAttendeeList(rsvps: readonly EventRsvp[], max = 15): string {
  if (rsvps.length === 0) return '_None yet_';
  const shown = rsvps.slice(0, max).map((rsvp) => rsvp.displayName);
  const remainder = rsvps.length - shown.length;
  return remainder > 0 ? `${shown.join(', ')} _and ${remainder} more_` : shown.join(', ');
}
