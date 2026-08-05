import type { FluxStyle } from '@phybot/shared';

/**
 * Wording appended to the prompt for each style.
 *
 * FLUX.2-klein renders whatever look the prompt implies, and a prompt that
 * names no look leaves the choice to the seed: "black armored warrior sitting
 * under a tree" came back as a photograph on one seed and as digital art on the
 * next of the same batch. Naming the medium settles it, which is why these are
 * phrased as camera and medium descriptions rather than quality words - "highly
 * detailed, masterpiece" does nothing here.
 */
const STYLE_SUFFIX: Record<FluxStyle, string> = {
  none: '',
  photo:
    'photograph, shot on 35mm film, natural light, shallow depth of field, photorealistic, fine skin and material texture',
  cinematic:
    'cinematic film still, anamorphic lens, dramatic key light, deep shadows, colour graded, shot on 70mm',
  illustration:
    'digital illustration, painted concept art, visible brush work, stylised shapes, rich colour',
  anime: 'anime illustration, cel shaded, clean line art, flat colour, studio animation style',
  render3d:
    '3D render, physically based materials, soft studio lighting, ray traced reflections, octane render',
};

/**
 * Builds the prompt that is actually sent to the generator. The result is what
 * gets stored with the image, so the gallery shows the wording that produced it
 * and re-running the same text reproduces the picture.
 */
export function applyStyle(prompt: string, style: FluxStyle | undefined): string {
  const suffix = style ? STYLE_SUFFIX[style] : '';
  if (!suffix) return prompt;
  // A prompt that already ends in punctuation should not gain a stray comma.
  const separator = /[,.;:]$/.test(prompt.trimEnd()) ? ' ' : ', ';
  return `${prompt.trimEnd()}${separator}${suffix}`;
}
