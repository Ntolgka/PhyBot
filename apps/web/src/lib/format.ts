/** Formatting helpers specific to the dashboard UI (complements
 * formatDuration/truncate/etc. exported by @phybot/shared). */

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

export function formatMemory(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

export function formatPing(ms: number): string {
  if (ms < 0) return '—';
  return `${Math.round(ms)} ms`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(epochMs));
}

export function formatRelativeTime(epochMs: number): string {
  const diffMs = epochMs - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: 'seconds' },
    { amount: 60, unit: 'minutes' },
    { amount: 24, unit: 'hours' },
    { amount: 7, unit: 'days' },
    { amount: 4.34524, unit: 'weeks' },
    { amount: 12, unit: 'months' },
    { amount: Number.POSITIVE_INFINITY, unit: 'years' },
  ];
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  let duration = diffSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), 'years');
}

/** Converts a `datetime-local` input value (local time, no timezone) to an
 * epoch-millisecond timestamp. */
export function localDateTimeToEpochMs(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

/** Converts an epoch-millisecond timestamp to a value usable by a
 * `datetime-local` input, in the viewer's local timezone. */
export function epochMsToLocalDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function bytesToDataSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
