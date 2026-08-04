import { describe, expect, it } from 'vitest';
import type { EventRsvp, GuildEvent } from '@phybot/shared';
import { formatAttendeeList, rsvpsByStatus, wouldExceedCapacity } from './logic.js';

function rsvp(userId: string, status: EventRsvp['status'], displayName = userId): EventRsvp {
  return { userId, displayName, status, respondedAt: Date.now() };
}

function baseEvent(overrides: Partial<GuildEvent> = {}): GuildEvent {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: null,
    title: 'Game night',
    description: '',
    location: '',
    startsAt: Date.now() + 3_600_000,
    endsAt: null,
    capacity: 0,
    createdBy: 'owner',
    createdByName: 'Owner',
    reminderMinutes: 30,
    reminderSentAt: null,
    cancelled: false,
    createdAt: Date.now(),
    rsvps: [],
    ...overrides,
  };
}

describe('wouldExceedCapacity', () => {
  it('never blocks unlimited events', () => {
    const event = baseEvent({ capacity: 0, rsvps: [rsvp('a', 'going'), rsvp('b', 'going')] });
    expect(wouldExceedCapacity(event, 'c', 'going')).toBe(false);
  });

  it('never blocks maybe/declined regardless of capacity', () => {
    const event = baseEvent({ capacity: 1, rsvps: [rsvp('a', 'going')] });
    expect(wouldExceedCapacity(event, 'b', 'maybe')).toBe(false);
    expect(wouldExceedCapacity(event, 'b', 'declined')).toBe(false);
  });

  it('blocks a new "going" once capacity is reached', () => {
    const event = baseEvent({ capacity: 2, rsvps: [rsvp('a', 'going'), rsvp('b', 'going')] });
    expect(wouldExceedCapacity(event, 'c', 'going')).toBe(true);
  });

  it('allows a spot when under capacity', () => {
    const event = baseEvent({ capacity: 2, rsvps: [rsvp('a', 'going')] });
    expect(wouldExceedCapacity(event, 'b', 'going')).toBe(false);
  });

  it('exempts a user re-confirming their own spot at full capacity', () => {
    const event = baseEvent({ capacity: 1, rsvps: [rsvp('a', 'going')] });
    expect(wouldExceedCapacity(event, 'a', 'going')).toBe(false);
  });

  it('exempts a user switching from maybe to going when a spot is free', () => {
    const event = baseEvent({ capacity: 2, rsvps: [rsvp('a', 'going'), rsvp('b', 'maybe')] });
    expect(wouldExceedCapacity(event, 'b', 'going')).toBe(false);
  });
});

describe('rsvpsByStatus', () => {
  it('filters by status', () => {
    const rsvps = [rsvp('a', 'going'), rsvp('b', 'maybe'), rsvp('c', 'going')];
    expect(rsvpsByStatus(rsvps, 'going').map((r) => r.userId)).toEqual(['a', 'c']);
    expect(rsvpsByStatus(rsvps, 'declined')).toEqual([]);
  });
});

describe('formatAttendeeList', () => {
  it('shows a placeholder for an empty list', () => {
    expect(formatAttendeeList([])).toBe('_None yet_');
  });

  it('joins names for a short list', () => {
    const rsvps = [rsvp('a', 'going', 'Alice'), rsvp('b', 'going', 'Bob')];
    expect(formatAttendeeList(rsvps)).toBe('Alice, Bob');
  });

  it('truncates long lists with a remainder count', () => {
    const rsvps = Array.from({ length: 20 }, (_, i) => rsvp(`u${i}`, 'going', `User ${i}`));
    const result = formatAttendeeList(rsvps, 5);
    expect(result).toBe('User 0, User 1, User 2, User 3, User 4 _and 15 more_');
  });
});
