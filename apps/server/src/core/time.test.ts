import { describe, expect, it } from 'vitest';
import { discordTimestamp, formatZoned, parseZonedDateTime } from './time.js';

describe('parseZonedDateTime', () => {
  it('reads a local time in a fixed offset zone', () => {
    // Istanbul is UTC+3 all year.
    const timestamp = parseZonedDateTime('2026-09-14 21:00', 'Europe/Istanbul');
    expect(timestamp).toBe(Date.UTC(2026, 8, 14, 18, 0));
  });

  it('handles daylight saving in a zone that observes it', () => {
    const summer = parseZonedDateTime('2026-07-01 12:00', 'Europe/Berlin');
    const winter = parseZonedDateTime('2026-01-01 12:00', 'Europe/Berlin');
    expect(summer).toBe(Date.UTC(2026, 6, 1, 10, 0));
    expect(winter).toBe(Date.UTC(2026, 0, 1, 11, 0));
  });

  it('accepts the ISO style separator and optional seconds', () => {
    expect(parseZonedDateTime('2026-09-14T21:00:30', 'UTC')).toBe(Date.UTC(2026, 8, 14, 21, 0, 30));
  });

  it('rejects text that is not a date', () => {
    expect(parseZonedDateTime('tomorrow evening', 'UTC')).toBeNull();
    expect(parseZonedDateTime('14/09/2026 21:00', 'UTC')).toBeNull();
  });
});

describe('formatZoned', () => {
  it('formats in the requested zone', () => {
    const formatted = formatZoned(Date.UTC(2026, 8, 14, 18, 0), 'Europe/Istanbul');
    expect(formatted).toContain('21:00');
  });
});

describe('discordTimestamp', () => {
  it('builds a relative marker in seconds', () => {
    expect(discordTimestamp(1_600_000_000_000, 'R')).toBe('<t:1600000000:R>');
  });
});
