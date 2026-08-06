/**
 * Turns a raw voice state change into the announcements it should produce.
 *
 * Discord fires `voiceStateUpdate` for mute, deafen, camera and streaming
 * changes as well as for coming and going, so most events resolve to nothing.
 * Keeping the decision here, away from the Discord objects, is what makes the
 * awkward cases - a move between two channels, the last person leaving, the bot
 * seeing its own state change - testable.
 */

export interface VoiceStateSnapshot {
  channelId: string | null;
  /** Humans left in that channel afterwards, not counting bots. */
  listenersAfter?: number;
}

export interface VoiceAnnounceInput {
  displayName: string;
  isBot: boolean;
  before: VoiceStateSnapshot;
  after: VoiceStateSnapshot;
}

export interface VoiceAnnouncement {
  channelId: string;
  text: string;
  kind: 'joined' | 'left';
}

export function joinedText(displayName: string): string {
  return `${displayName} odaya giriş yaptı.`;
}

export function leftText(displayName: string): string {
  return `${displayName} odadan ayrıldı.`;
}

/**
 * A move between channels is both a departure and an arrival, and is reported
 * in that order so the room being left hears about it first.
 */
export function announcementsFor(input: VoiceAnnounceInput): VoiceAnnouncement[] {
  if (input.isBot) return [];

  const from = input.before.channelId;
  const to = input.after.channelId;
  // Mute, deafen, going live: the channel did not change, so nobody came or went.
  if (from === to) return [];

  const result: VoiceAnnouncement[] = [];

  // Nothing to say to an empty room, and the bot should not follow someone into
  // one just to talk to itself.
  if (from && (input.before.listenersAfter ?? 0) > 0) {
    result.push({ channelId: from, text: leftText(input.displayName), kind: 'left' });
  }
  if (to) {
    result.push({ channelId: to, text: joinedText(input.displayName), kind: 'joined' });
  }
  return result;
}
