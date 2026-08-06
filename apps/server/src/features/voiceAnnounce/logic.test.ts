import { describe, expect, it } from 'vitest';
import { announcementsFor, joinedText, leftText } from './logic.js';

const person = { displayName: 'Tolga', isBot: false };

describe('announcementsFor', () => {
  it('announces an arrival in the channel that was joined', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: null },
      after: { channelId: 'general' },
    });
    expect(result).toEqual([
      { channelId: 'general', text: 'Tolga odaya giriş yaptı.', kind: 'joined' },
    ]);
  });

  it('announces a departure while someone is still there to hear it', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: 'general', listenersAfter: 2 },
      after: { channelId: null },
    });
    expect(result).toEqual([{ channelId: 'general', text: 'Tolga odadan ayrıldı.', kind: 'left' }]);
  });

  it('says nothing when the last person leaves', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: 'general', listenersAfter: 0 },
      after: { channelId: null },
    });
    expect(result).toEqual([]);
  });

  it('reports a move as a departure then an arrival', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: 'general', listenersAfter: 1 },
      after: { channelId: 'gaming' },
    });
    expect(result.map((entry) => [entry.kind, entry.channelId])).toEqual([
      ['left', 'general'],
      ['joined', 'gaming'],
    ]);
  });

  it('skips the departure half of a move out of a room left empty', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: 'general', listenersAfter: 0 },
      after: { channelId: 'gaming' },
    });
    expect(result.map((entry) => entry.kind)).toEqual(['joined']);
  });

  it('ignores mute, deafen and going live, which keep the same channel', () => {
    const result = announcementsFor({
      ...person,
      before: { channelId: 'general', listenersAfter: 3 },
      after: { channelId: 'general' },
    });
    expect(result).toEqual([]);
  });

  it('ignores other bots', () => {
    const result = announcementsFor({
      displayName: 'SomeBot',
      isBot: true,
      before: { channelId: null },
      after: { channelId: 'general' },
    });
    expect(result).toEqual([]);
  });

  it('uses the display name in both lines', () => {
    expect(joinedText('Ayşe')).toBe('Ayşe odaya giriş yaptı.');
    expect(leftText('Ayşe')).toBe('Ayşe odadan ayrıldı.');
  });
});
