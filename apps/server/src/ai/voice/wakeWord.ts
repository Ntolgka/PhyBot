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

/**
 * Words people put in front of the name, and the noises speech recognition
 * writes down when someone clears their throat first. One of these may precede
 * the wake word; anything else means the name was said mid-sentence, which is
 * talk about the bot rather than talk to it.
 */
const LEADING_FILLERS = new Set([
  'hey',
  'ey',
  'hi',
  'hello',
  'ok',
  'okay',
  'so',
  'um',
  'uh',
  'er',
  'ee',
  'eee',
  'ya',
  'ha',
  'he',
  'selam',
  'merhaba',
  'tamam',
  'peki',
  'bak',
  'sey',
]);

export interface WakeWordMatch {
  matched: boolean;
  /** The transcript with the wake word removed, trimmed. Empty when no match. */
  rest: string;
}

/**
 * Checks whether a transcript opens with the configured wake word, tolerating
 * minor STT mishearings, and returns the remainder to send to the assistant.
 *
 * The name may be preceded by a single filler word, because "hey fay, skip
 * this" is how people actually talk and recognition likes to prefix a stray
 * "ee" to whatever it heard first. Everything from the name onwards is the
 * request.
 */
export function matchesWakeWord(transcript: string, wakeWord: string): WakeWordMatch {
  const normalizedWake = normalizeTranscript(wakeWord);
  if (!normalizedWake) return { matched: false, rest: '' };

  const wakeTokens = normalizedWake.split(' ');
  const transcriptTokens = normalizeTranscript(transcript).split(' ').filter(Boolean);
  const threshold = Math.max(1, Math.floor(normalizedWake.length / 4));

  for (let offset = 0; offset <= 1; offset += 1) {
    if (offset > 0 && !LEADING_FILLERS.has(transcriptTokens[offset - 1] ?? '')) break;
    if (transcriptTokens.length < offset + wakeTokens.length) break;

    const candidate = transcriptTokens.slice(offset, offset + wakeTokens.length).join(' ');
    const isAliasMatch =
      wakeTokens.length === 1 && PHY_ALIASES.has(normalizedWake) && PHY_ALIASES.has(candidate);

    if (levenshteinDistance(candidate, normalizedWake) <= threshold || isAliasMatch) {
      return {
        matched: true,
        rest: transcriptTokens
          .slice(offset + wakeTokens.length)
          .join(' ')
          .trim(),
      };
    }
  }

  return { matched: false, rest: '' };
}
