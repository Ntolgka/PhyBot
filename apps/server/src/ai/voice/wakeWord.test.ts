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

  it('tolerates a small typo in a custom wake word', () => {
    // "robo" is missing the trailing "t" - a one-character edit away from "robot".
    const result = matchesWakeWord('robo ışıkları aç', 'robot');
    expect(result.matched).toBe(true);
    expect(result.rest).toBe('isiklari ac');
  });
});
