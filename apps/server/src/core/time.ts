/** Timezone helpers built on Intl so no date library is needed. */

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function offsetAt(utcMillis: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(utcMillis));
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(value);
  };
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') % 24,
    lookup('minute'),
    lookup('second'),
  );
  return asUtc - utcMillis;
}

/**
 * Converts "YYYY-MM-DD HH:mm" written in `timeZone` into an epoch timestamp.
 * Returns null when the text does not match the expected shape.
 */
export function parseZonedDateTime(input: string, timeZone: string): number | null {
  const match = DATE_TIME_PATTERN.exec(input.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;

  const naive = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );
  if (!Number.isFinite(naive)) return null;

  // Two passes settle the value around daylight saving transitions.
  let utc = naive - offsetAt(naive, timeZone);
  utc = naive - offsetAt(utc, timeZone);
  return utc;
}

/** Discord renders <t:seconds:F> in each viewer's own locale and timezone. */
export function discordTimestamp(timestamp: number, style: 'F' | 'R' | 't' | 'd' = 'F'): string {
  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}
