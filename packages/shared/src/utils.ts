/** Formatting helpers shared by the bot embeds and the dashboard. */

/** Renders seconds as h:mm:ss (or m:ss below an hour). Live tracks show LIVE. */
export function formatDuration(seconds: number, live = false): string {
  if (live) return 'LIVE';
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Sums track durations, returning -1 when the list contains a live stream. */
export function totalDuration(tracks: { duration: number; isLive: boolean }[]): number {
  let total = 0;
  for (const track of tracks) {
    if (track.isLive) return -1;
    total += track.duration;
  }
  return total;
}

/** Truncates text for embeds and UI labels without cutting mid surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${Array.from(text)
    .slice(0, Math.max(0, max - 1))
    .join('')}…`;
}

/**
 * Fisher-Yates shuffle. Returns a new array so callers can shuffle a queue
 * without mutating the source list.
 */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Clamps a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Renders a text progress bar, used in embeds and as a UI fallback. */
export function progressBar(position: number, duration: number, size = 20): string {
  if (duration <= 0) return '▬'.repeat(size);
  const ratio = clamp(position / duration, 0, 1);
  const index = Math.min(size - 1, Math.floor(ratio * size));
  return `${'━'.repeat(index)}●${'━'.repeat(size - index - 1)}`;
}

/** Replaces {user}, {server}, {count} style tokens in configurable messages. */
export function applyTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
