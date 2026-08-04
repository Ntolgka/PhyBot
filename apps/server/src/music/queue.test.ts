import { describe, expect, it } from 'vitest';
import type { Track } from '@phybot/shared';
import { TrackQueue } from './queue.js';

function track(id: string, url = `https://example.com/${id}`): Track {
  return {
    id,
    title: `Track ${id}`,
    author: 'Tester',
    url,
    duration: 100,
    isLive: false,
    thumbnail: null,
    source: 'youtube',
    requestedBy: '1',
    requestedByName: 'Tester',
    addedAt: 0,
  };
}

/** Deterministic replacement for Math.random in shuffle tests. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('TrackQueue', () => {
  it('plays tracks in order', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b')]);

    expect(queue.next()?.id).toBe('a');
    expect(queue.next()?.id).toBe('b');
    expect(queue.next()).toBeNull();
  });

  it('adds to the front when requested', () => {
    const queue = new TrackQueue();
    queue.add([track('a')]);
    queue.add([track('b')], { next: true });

    expect(queue.next()?.id).toBe('b');
  });

  it('repeats the current track until a forced skip', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b')]);
    queue.next();
    queue.loop = 'track';

    expect(queue.next()?.id).toBe('a');
    expect(queue.next({ force: true })?.id).toBe('b');
  });

  it('restarts the queue when looping the whole queue', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b')]);
    queue.loop = 'queue';

    expect(queue.next()?.id).toBe('a');
    expect(queue.next()?.id).toBe('b');
    expect(queue.next()?.id).toBe('a');
  });

  it('walks back through history', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b')]);
    queue.next();
    queue.next();

    expect(queue.previous()?.id).toBe('a');
    // The track that was playing goes back to the front of the queue.
    expect(queue.tracks[0]?.id).toBe('b');
  });

  it('picks a random track when shuffle is on', () => {
    const queue = new TrackQueue(sequence([0.9]));
    queue.shuffle = true;
    queue.add([track('a'), track('b'), track('c')]);

    expect(queue.next()?.id).toBe('c');
  });

  it('mixes the pending queue without touching the current track', () => {
    const queue = new TrackQueue(sequence([0, 0, 0]));
    queue.add([track('a'), track('b'), track('c')]);
    queue.next();

    queue.shuffleAll();
    expect(queue.current?.id).toBe('a');
    expect([...queue.tracks].map((item) => item.id).sort()).toEqual(['b', 'c']);
  });

  it('jumps forward and treats skipped tracks as played', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b'), track('c')]);

    expect(queue.jumpTo(2)?.id).toBe('c');
    expect(queue.size).toBe(0);
    expect(queue.history.map((item) => item.id)).toContain('a');
  });

  it('removes duplicates by url', () => {
    const queue = new TrackQueue();
    queue.add([track('a', 'https://x/1'), track('b', 'https://x/1'), track('c', 'https://x/2')]);

    expect(queue.dedupe()).toBe(1);
    expect(queue.size).toBe(2);
  });

  it('moves tracks inside the queue', () => {
    const queue = new TrackQueue();
    queue.add([track('a'), track('b'), track('c')]);

    expect(queue.move(2, 0)).toBe(true);
    expect(queue.tracks.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(queue.move(9, 0)).toBe(false);
  });

  it('reports every known url so autoplay does not repeat itself', () => {
    const queue = new TrackQueue();
    queue.add([track('a', 'https://x/1'), track('b', 'https://x/2')]);
    queue.next();

    expect(queue.knownUrls()).toEqual(new Set(['https://x/1', 'https://x/2']));
  });
});
