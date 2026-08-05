import { describe, expect, it } from 'vitest';
import { matchesWakeWord, normalizeTranscript } from './wakeWord.js';

describe('normalizeTranscript', () => {
  it('lower-cases and folds Turkish letters to ASCII', () => {
    expect(normalizeTranscript('Şarkı Çal')).toBe('sarki cal');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeTranscript('Phy,   müziği   durdur!!')).toBe('phy muzigi durdur');
  });

  it('returns an empty string for input with no letters', () => {
    expect(normalizeTranscript('!!!')).toBe('');
  });
});

describe('matchesWakeWord', () => {
  it('matches an exact wake word and strips it from the transcript', () => {
    const result = matchesWakeWord('phy müzik çal', 'phy');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('muzik cal');
  });

  it('is case and diacritic insensitive', () => {
    const result = matchesWakeWord('PHY sesi kapat', 'phy');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('sesi kapat');
  });

  it('tolerates common mishearings of the default wake word', () => {
    for (const heard of ['fay müziği durdur', 'fi sırayı göster', 'phi ne çalıyor']) {
      expect(matchesWakeWord(heard, 'phy').matched).toBe(true);
    }
  });

  it('does not match when the wake word is absent', () => {
    const result = matchesWakeWord('bugün hava çok güzel', 'phy');
    expect(result.matched).toBe(false);
    expect(result.rest).toBe('');
  });

  it('does not match on an unrelated short word', () => {
    expect(matchesWakeWord('bay merhaba', 'phy').matched).toBe(false);
  });

  it('supports multi-word wake phrases', () => {
    const result = matchesWakeWord('hey phy şarkı çal', 'hey phy');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('sarki cal');
  });

  it('returns no match when the transcript is empty', () => {
    expect(matchesWakeWord('', 'phy').matched).toBe(false);
  });

  it('allows one filler word in front of the name', () => {
    for (const heard of ['hey fay şarkıyı geç', 'okay fay sesi kıs', 'ee fay ne çalıyor']) {
      const result = matchesWakeWord(heard, 'fay');
      expect(result.matched).toBe(true);
      expect(result.rest.startsWith('fay')).toBe(false);
    }
  });

  it('ignores the name said in the middle of a sentence', () => {
    // Talk about the bot, not to it: only a filler may come before the name.
    expect(matchesWakeWord('ben ona dedim ki fay gelsin', 'fay').matched).toBe(false);
    expect(matchesWakeWord('I was telling him about the fair yesterday', 'fay').matched).toBe(
      false,
    );
  });

  it('returns an empty request when only the name was said', () => {
    // The listener needs this to stay quiet rather than answer nothing.
    const result = matchesWakeWord('fay', 'fay');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('');
  });

  it('tolerates a small typo in a custom wake word', () => {
    // "robo" is missing the trailing "t" - a one-character edit away from "robot".
    const result = matchesWakeWord('robo ışıkları aç', 'robot');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('isiklari ac');
  });
});
