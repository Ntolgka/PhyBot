import { z } from 'zod';
import { LOOP_MODES, MAX_VOLUME, MIN_VOLUME } from '@phybot/shared';
import { toJsonSchema } from './providers/schema.js';
import type { ToolDefinition } from './providers/types.js';

/**
 * One zod schema per assistant capability. Keeping arguments small and typed
 * means a malformed model response fails validation instead of reaching the
 * music engine with unexpected input.
 */
export const toolSchemas = {
  play_music: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe('Song, artist, playlist name or a direct URL'),
    next: z.boolean().optional().describe('Insert at the front of the queue instead of the end'),
    shuffle: z.boolean().optional().describe('Shuffle the tracks before adding them'),
  }),
  pause: z.object({}),
  resume: z.object({}),
  skip: z.object({
    count: z.number().int().min(1).max(50).optional().describe('How many tracks to skip'),
  }),
  previous: z.object({}),
  restart_track: z.object({}),
  stop: z.object({}),
  seek: z.object({
    seconds: z.number().min(0).max(36_000).describe('Absolute position in seconds'),
  }),
  seek_relative: z.object({
    delta: z.number().min(-3600).max(3600).describe('Seconds to jump forward or back'),
  }),
  set_volume: z.object({ percent: z.number().int().min(MIN_VOLUME).max(MAX_VOLUME) }),
  set_loop: z.object({ mode: z.enum(LOOP_MODES) }),
  shuffle_queue: z.object({}),
  toggle_autoplay: z.object({ enabled: z.boolean() }),
  queue_info: z.object({}),
  now_playing: z.object({}),
  leave_voice: z.object({}),
  list_events: z.object({}),
  generate_image: z.object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .describe('What the picture should show, in English for the best result'),
    count: z.number().int().min(1).max(4).optional().describe('How many images, 1 to 4'),
  }),
  answer: z.object({
    text: z.string().trim().min(1).max(1000).describe('The reply to speak or show to the user'),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

export const TOOL_NAMES = Object.keys(toolSchemas) as ToolName[];

const toolDescriptions: Record<ToolName, string> = {
  play_music:
    "Search for and queue a track, playlist or URL, joining the caller's voice channel if needed.",
  pause: 'Pause the currently playing track.',
  resume: 'Resume a paused track.',
  skip: 'Skip the current track, optionally by more than one.',
  previous: 'Go back to the previously played track.',
  restart_track: 'Restart the current track from the beginning.',
  stop: 'Stop playback and clear the queue.',
  seek: 'Jump to an absolute position in the current track.',
  seek_relative: 'Jump forward or backward relative to the current position.',
  set_volume: 'Set the playback volume as a percentage.',
  set_loop: 'Set the loop mode: off, single track, or the whole queue.',
  shuffle_queue: 'Shuffle the pending queue.',
  toggle_autoplay: 'Enable or disable autoplay of related tracks when the queue ends.',
  queue_info: 'Report what is queued next.',
  now_playing: 'Report the currently playing track and position.',
  leave_voice: 'Disconnect from the voice channel.',
  list_events: 'List upcoming scheduled server events.',
  generate_image:
    'Draw or generate a picture from a description, locally on this machine. Use it whenever the user asks for an image, a drawing, a picture or a wallpaper.',
  answer: 'Reply conversationally without taking any action on the music bot.',
};

/** Builds the tool declarations sent to the model on every chat turn. */
export function buildToolDefinitions(): ToolDefinition[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: toolDescriptions[name],
    parameters: toJsonSchema(toolSchemas[name]),
  }));
}

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(toolSchemas, value);
}
