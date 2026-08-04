/**
 * Scales 16-bit little-endian PCM samples by a linear volume factor.
 *
 * The shared audio player's `playAnnouncement` helper plays raw PCM without
 * an inline volume control, so a soundboard clip's per-sound volume has to be
 * baked into the samples before playback instead.
 */
export function scalePcmVolume(pcm: Buffer, factor: number): Buffer {
  if (factor === 1) return pcm;

  const clampedFactor = Math.max(0, factor);
  const output = Buffer.alloc(pcm.length);
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    const scaled = Math.round(sample * clampedFactor);
    output.writeInt16LE(Math.min(32767, Math.max(-32768, scaled)), offset);
  }
  return output;
}
