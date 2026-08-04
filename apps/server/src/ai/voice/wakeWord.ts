/** Folds Turkish letters that have no ASCII form to their closest equivalent. */
const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ç: 'c',
  ö: 'o',
  ü: 'u',
};

/**
 * Lower-cases, folds Turkish letters to their closest ASCII equivalent, and
 * strips punctuation so wake-word and transcript comparisons are not thrown
 * off by casing, diacritics, or STT punctuation guesses.
 */
export function normalizeTranscript(text: string): string {
  let result = '';
  for (const char of text.toLocaleLowerCase('tr-TR')) {
    const mapped = TURKISH_CHAR_MAP[char] ?? char;
    result += /[a-z0-9 ]/.test(mapped) ? mapped : ' ';
  }
  return result.replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) distances[i]![0] = i;
  for (let j = 0; j < cols; j += 1) distances[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost,
      );
    }
  }
  return distances[rows - 1]![cols - 1]!;
}

/**
 * Ways speech-to-text actually renders the default wake word. Measured by
 * speaking each form with the bot's own Turkish voice and transcribing it:
 * "phy" came back as "eeeh eeeh eeeh", "fi" as "fil" and "phybot" as "peebot",
 * which is why "fay" is the shipped default. Only used when the configured
 * wake word normalizes to one of these short forms.
 */
const PHY_ALIASES = new Set([
  'fay',
  'fai',
  'fey',
  'faye',
  'phy',
  'phi',
  'fi',
  'fii',
  'fil',
  'vay',
  'faybot',
  'phybot',
  'peebot',
  'faybold',
]);

export interface WakeWordMatch {
  matched: boolean;
  /** The transcript with the wake word removed, trimmed. Empty when no match. */
  rest: string;
}

/**
 * Checks whether a transcript opens with the configured wake word, tolerating
 * minor STT mishearings, and returns the remainder to send to the assistant.
 */
export function matchesWakeWord(transcript: string, wakeWord: string): WakeWordMatch {
  const normalizedWake = normalizeTranscript(wakeWord);
  if (!normalizedWake) return { matched: false, rest: '' };

  const wakeTokens = normalizedWake.split(' ');
  const transcriptTokens = normalizeTranscript(transcript).split(' ').filter(Boolean);
  if (transcriptTokens.length < wakeTokens.length) return { matched: false, rest: '' };

  const candidate = transcriptTokens.slice(0, wakeTokens.length).join(' ');
  const distance = levenshteinDistance(candidate, normalizedWake);
  const threshold = Math.max(1, Math.floor(normalizedWake.length / 4));
  const isAliasMatch =
    wakeTokens.length === 1 && PHY_ALIASES.has(normalizedWake) && PHY_ALIASES.has(candidate);

  if (distance > threshold && !isAliasMatch) return { matched: false, rest: '' };

  return { matched: true, rest: transcriptTokens.slice(wakeTokens.length).join(' ').trim() };
}
