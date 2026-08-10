import { describe, expect, it } from 'vitest';
import type { Track } from '@phybot/shared';
import { TrackQueue } from './queue.js';

function track(n: number): Track {
  return {
    id: `t${n}`,
    title: `Song ${n}`,
    author: 'Artist',
    url: `https://example.com/${n}`,
    duration: 180,
    isLive: false,
    thumbnail: null,
    source: 'youtube',
    requestedBy: '1',
    requestedByName: 'Tolga',
    addedAt: 0,
  };
}

/**
 * The queue rearranging that GuildPlayer.playSelection does, without the audio
 * pipeline: pull the chosen positions out and put them at the front in the
 * order they were picked.
 */
function selectInto(queue: TrackQueue, indices: number[]): string[] {
  const wanted = [...new Set(indices)].filter((index) => index >= 0 && index < queue.tracks.length);
  const removed = new Map<number, Track>();
  for (const index of [...wanted].sort((a, b) => b - a)) {
    const item = queue.removeAt(index);
    if (item) removed.set(index, item);
  }
  const picked = wanted
    .map((index) => removed.get(index))
    .filter((item): item is Track => item !== undefined);
  queue.add(picked, { next: true });
  return queue.tracks.map((item) => item.title);
}

describe('picking queue positions by number', () => {
  it('moves one number to the front and keeps everything else', () => {
    const queue = new TrackQueue();
    queue.add([1, 2, 3, 4, 5].map(track));
    expect(selectInto(queue, [2])).toEqual(['Song 3', 'Song 1', 'Song 2', 'Song 4', 'Song 5']);
  });

  it('plays several numbers in the order they were ticked, not queue order', () => {
    const queue = new TrackQueue();
    queue.add([1, 2, 3, 4, 5].map(track));
    // Picked as 4, then 1, then 3.
    expect(selectInto(queue, [3, 0, 2])).toEqual([
      'Song 4',
      'Song 1',
      'Song 3',
      'Song 2',
      'Song 5',
    ]);
  });

  it('reads high positions correctly, which needs removal from the back', () => {
    const queue = new TrackQueue();
    queue.add(Array.from({ length: 40 }, (_, index) => track(index + 1)));
    const result = selectInto(queue, [0, 1, 22, 32]);
    expect(result.slice(0, 4)).toEqual(['Song 1', 'Song 2', 'Song 23', 'Song 33']);
    expect(result).toHaveLength(40);
  });

  it('ignores numbers past the end of the queue', () => {
    const queue = new TrackQueue();
    queue.add([1, 2, 3].map(track));
    expect(selectInto(queue, [1, 99])).toEqual(['Song 2', 'Song 1', 'Song 3']);
  });

  it('loses nothing when every position is picked', () => {
    const queue = new TrackQueue();
    queue.add([1, 2, 3].map(track));
    expect(selectInto(queue, [2, 1, 0])).toEqual(['Song 3', 'Song 2', 'Song 1']);
  });

  it('numbers still mean the same thing after the queue is mixed', () => {
    const queue = new TrackQueue(() => 0.42);
    queue.add(Array.from({ length: 10 }, (_, index) => track(index + 1)));
    queue.shuffleAll();
    // Whatever order mixing produced, position 5 is the sixth line shown.
    const sixth = queue.tracks[5]?.title;
    expect(selectInto(queue, [5])[0]).toBe(sixth);
  });
});
