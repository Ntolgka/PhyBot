import type { LoopMode, Track } from '@phybot/shared';
import { MAX_QUEUE_SIZE, shuffled } from '@phybot/shared';

export interface QueueAddResult {
  added: number;
  /** Tracks dropped because the queue is full. */
  rejected: number;
}

/**
 * Playback order for one guild. Kept free of Discord and streaming concerns so
 * the ordering rules (loop, shuffle, history) can be unit tested on their own.
 */
export class TrackQueue {
  private upcoming: Track[] = [];
  private past: Track[] = [];

  current: Track | null = null;
  loop: LoopMode = 'off';
  shuffle = false;

  constructor(private readonly random: () => number = Math.random) {}

  get tracks(): readonly Track[] {
    return this.upcoming;
  }

  /** Previously played tracks, newest first. */
  get history(): readonly Track[] {
    return [...this.past].reverse();
  }

  get size(): number {
    return this.upcoming.length;
  }

  get isEmpty(): boolean {
    return this.upcoming.length === 0 && this.current === null;
  }

  add(tracks: Track[], options: { next?: boolean } = {}): QueueAddResult {
    const capacity = MAX_QUEUE_SIZE - this.upcoming.length;
    const accepted = tracks.slice(0, Math.max(0, capacity));
    if (options.next) {
      this.upcoming.unshift(...accepted);
    } else {
      this.upcoming.push(...accepted);
    }
    return { added: accepted.length, rejected: tracks.length - accepted.length };
  }

  remove(trackId: string): Track | null {
    const index = this.upcoming.findIndex((track) => track.id === trackId);
    if (index === -1) return null;
    return this.upcoming.splice(index, 1)[0] ?? null;
  }

  removeAt(index: number): Track | null {
    if (index < 0 || index >= this.upcoming.length) return null;
    return this.upcoming.splice(index, 1)[0] ?? null;
  }

  move(from: number, to: number): boolean {
    if (from < 0 || from >= this.upcoming.length) return false;
    const target = Math.min(Math.max(to, 0), this.upcoming.length - 1);
    const [item] = this.upcoming.splice(from, 1);
    if (!item) return false;
    this.upcoming.splice(target, 0, item);
    return true;
  }

  clear(): number {
    const removed = this.upcoming.length;
    this.upcoming = [];
    return removed;
  }

  clearHistory(): void {
    this.past = [];
  }

  /** Randomises the pending queue without touching the current track. */
  shuffleAll(): number {
    this.upcoming = shuffled(this.upcoming, this.random);
    return this.upcoming.length;
  }

  /** Removes duplicate entries (same url), keeping the first occurrence. */
  dedupe(): number {
    const seen = new Set<string>();
    const filtered: Track[] = [];
    for (const track of this.upcoming) {
      if (seen.has(track.url)) continue;
      seen.add(track.url);
      filtered.push(track);
    }
    const removed = this.upcoming.length - filtered.length;
    this.upcoming = filtered;
    return removed;
  }

  /** Drops every track queued by one user, used by the dashboard and moderators. */
  removeByUser(userId: string): number {
    const before = this.upcoming.length;
    this.upcoming = this.upcoming.filter((track) => track.requestedBy !== userId);
    return before - this.upcoming.length;
  }

  /**
   * Advances to the next track.
   * `force` is set by an explicit skip so single-track loop does not trap it.
   */
  next(options: { force?: boolean } = {}): Track | null {
    if (this.current && this.loop === 'track' && !options.force) {
      return this.current;
    }
    if (this.current) {
      this.past.push(this.current);
      if (this.past.length > 100) this.past.shift();
    }

    let nextTrack = this.takeNext();
    if (!nextTrack && this.loop === 'queue' && this.past.length > 0) {
      this.upcoming = [...this.past];
      this.past = [];
      nextTrack = this.takeNext();
    }

    this.current = nextTrack;
    return this.current;
  }

  private takeNext(): Track | null {
    if (this.upcoming.length === 0) return null;
    const index = this.shuffle ? Math.floor(this.random() * this.upcoming.length) : 0;
    return this.upcoming.splice(index, 1)[0] ?? null;
  }

  /** Steps back to the previously played track. */
  previous(): Track | null {
    const last = this.past.pop();
    if (!last) return null;
    if (this.current) this.upcoming.unshift(this.current);
    this.current = last;
    return this.current;
  }

  /** Jumps to a queue position; skipped tracks are treated as played. */
  jumpTo(index: number): Track | null {
    if (index < 0 || index >= this.upcoming.length) return null;
    const skipped = this.upcoming.splice(0, index);
    if (this.current) this.past.push(this.current);
    this.past.push(...skipped);
    this.current = this.upcoming.shift() ?? null;
    return this.current;
  }

  /** Puts the current track back at the front, used when restarting playback. */
  restartCurrent(): Track | null {
    return this.current;
  }

  /** URLs of everything played or queued, used to keep autoplay from repeating. */
  knownUrls(): Set<string> {
    const urls = new Set<string>();
    for (const track of this.past) urls.add(track.url);
    for (const track of this.upcoming) urls.add(track.url);
    if (this.current) urls.add(this.current.url);
    return urls;
  }
}
