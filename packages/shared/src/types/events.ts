export const RSVP_STATUSES = ['going', 'maybe', 'declined'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export interface EventRsvp {
  userId: string;
  displayName: string;
  status: RsvpStatus;
  respondedAt: number;
}

export interface GuildEvent {
  id: number;
  guildId: string;
  channelId: string;
  /** Message holding the RSVP buttons; null until it has been posted. */
  messageId: string | null;
  title: string;
  description: string;
  location: string;
  /** Epoch milliseconds, always stored in UTC. */
  startsAt: number;
  endsAt: number | null;
  /** 0 means unlimited. */
  capacity: number;
  createdBy: string;
  createdByName: string;
  /** Minutes before the start when attendees get pinged; 0 disables it. */
  reminderMinutes: number;
  reminderSentAt: number | null;
  cancelled: boolean;
  createdAt: number;
  rsvps: EventRsvp[];
}

export interface EventInput {
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: number;
  endsAt?: number | null;
  capacity?: number;
  reminderMinutes?: number;
}
