import { z } from 'zod';
import { MAX_VOLUME, MIN_VOLUME } from './constants.js';
import { ACTIVITY_TYPES, PRESENCE_STATUSES } from './types/bot.js';
import { AI_PROVIDERS, STT_PROVIDERS } from './types/ai.js';
import { CUSTOM_COMMAND_TYPES } from './types/commands.js';
import { GAME_STORES } from './types/freegames.js';
import { FLUX_BACKENDS, FLUX_STYLES, MAX_FLUX_BATCH, MIN_FLUX_BATCH } from './types/flux.js';
import { LOOP_MODES } from './types/music.js';
import { TTS_PROVIDERS } from './types/tts.js';

/** A time of day as 24 hour HH:MM, which is what a daily schedule needs. */
export const dailyTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24 hour time such as 22:00');

/**
 * An IANA zone name, checked by asking the platform rather than against a list
 * that would go stale. A zone the runtime cannot read would leave the schedule
 * silently never firing, so it is rejected at the edge.
 */
export const ianaTimezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

/** Discord snowflakes are 17-20 digit numeric strings. */
export const snowflake = z.string().regex(/^\d{17,20}$/, 'Invalid Discord id');
const nullableSnowflake = snowflake.nullable();
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex color such as #5865F2');

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required').max(512),
});

export const guildSettingsUpdateSchema = z
  .object({
    prefix: z.string().min(1).max(5),
    locale: z.enum(['tr', 'en']),
    djRoleId: nullableSnowflake,
    autoRoleId: nullableSnowflake,
    autoRoleEnabled: z.boolean(),
    autoRoleBotId: nullableSnowflake,
    welcomeEnabled: z.boolean(),
    welcomeChannelId: nullableSnowflake,
    welcomeMessage: z.string().max(1500),
    goodbyeEnabled: z.boolean(),
    goodbyeChannelId: nullableSnowflake,
    goodbyeMessage: z.string().max(1500),
    musicTextChannelId: nullableSnowflake,
    turksigaraChannelId: nullableSnowflake,
    turksigaraTime: dailyTime,
    turksigaraTimezone: ianaTimezone,
    announceNowPlaying: z.boolean(),
    defaultVolume: z.number().int().min(MIN_VOLUME).max(MAX_VOLUME),
    idleTimeoutSeconds: z.number().int().min(0).max(3600),
    freeGamesEnabled: z.boolean(),
    freeGamesChannelId: nullableSnowflake,
    freeGamesRoleId: nullableSnowflake,
    freeGamesStores: z.array(z.enum(GAME_STORES)).max(GAME_STORES.length),
    eventsChannelId: nullableSnowflake,
    eventReminderMinutes: z.number().int().min(0).max(10080),
    aiEnabled: z.boolean(),
    aiVoiceEnabled: z.boolean(),
    voiceAnnounceEnabled: z.boolean(),
    aiTextChannelId: nullableSnowflake,
  })
  .partial();

export const playRequestSchema = z.object({
  query: z.string().min(1, 'Enter a link or search term').max(2000),
  /** Voice channel to join; required when the bot is not connected yet. */
  voiceChannelId: snowflake.optional(),
  textChannelId: snowflake.optional(),
  /** Put the request at the front of the queue. */
  next: z.boolean().optional(),
  /** Shuffle the imported tracks before queueing them. */
  shuffle: z.boolean().optional(),
});

export const seekSchema = z.object({
  /** Absolute position in seconds. */
  position: z
    .number()
    .min(0)
    .max(24 * 3600),
});

export const seekRelativeSchema = z.object({
  /** Signed offset in seconds, applied to the current position. */
  delta: z.number().min(-3600).max(3600),
});

export const volumeSchema = z.object({
  volume: z.number().int().min(MIN_VOLUME).max(MAX_VOLUME),
});

export const loopSchema = z.object({
  mode: z.enum(LOOP_MODES),
});

export const toggleSchema = z.object({
  enabled: z.boolean(),
});

export const queueMoveSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
});

export const jumpSchema = z.object({
  index: z.number().int().min(0),
});

export const joinSchema = z.object({
  voiceChannelId: snowflake,
  textChannelId: snowflake.optional(),
});

export const eventInputSchema = z.object({
  guildId: snowflake,
  channelId: snowflake,
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive().nullable().optional(),
  capacity: z.number().int().min(0).max(10000).optional(),
  reminderMinutes: z.number().int().min(0).max(10080).optional(),
});

export const eventUpdateSchema = eventInputSchema.omit({ guildId: true }).partial();

export const customCommandInputSchema = z.object({
  guildId: snowflake,
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, dashes or underscores'),
  description: z.string().max(100).optional(),
  type: z.enum(CUSTOM_COMMAND_TYPES).optional(),
  content: z.string().min(1).max(4000),
  embedTitle: z.string().max(256).nullable().optional(),
  embedColor: hexColor.nullable().optional(),
  embedImageUrl: z.url().max(500).nullable().optional(),
  requiredRoleId: nullableSnowflake.optional(),
  slash: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const customCommandUpdateSchema = customCommandInputSchema.omit({ guildId: true }).partial();

export const rolePanelOptionSchema = z.object({
  roleId: snowflake,
  label: z.string().min(1).max(80),
  description: z.string().max(100).default(''),
  emoji: z.string().max(64).nullable().default(null),
});

export const rolePanelInputSchema = z.object({
  guildId: snowflake,
  channelId: snowflake,
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  exclusive: z.boolean().optional(),
  options: z.array(rolePanelOptionSchema).min(1).max(25),
});

const soundDataUrl = z
  .string()
  .regex(
    /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i,
    'Upload an audio file (mp3, ogg, wav, m4a, flac or webm)',
  );

export const soundInputSchema = z.object({
  guildId: snowflake,
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, dashes or underscores'),
  description: z.string().max(100).optional(),
  emoji: z.string().max(64).nullable().optional(),
  slash: z.boolean().optional(),
  volume: z.number().int().min(MIN_VOLUME).max(MAX_VOLUME).optional(),
  file: soundDataUrl,
  originalName: z.string().max(200).optional(),
});

export const soundUpdateSchema = soundInputSchema
  .omit({ guildId: true })
  .partial()
  .extend({ file: soundDataUrl.optional() });

export const soundPlaySchema = z.object({
  guildId: snowflake,
  voiceChannelId: snowflake.optional(),
});

export const sendMessageSchema = z.object({
  guildId: snowflake,
  channelId: snowflake,
  /** Discord's own limit on a plain message. */
  content: z.string().min(1, 'Write something to send').max(2000),
});

export const fluxGenerateSchema = z.object({
  prompt: z.string().min(1, 'Describe the image you want').max(1500),
  negativePrompt: z.string().max(1000).optional(),
  style: z.enum(FLUX_STYLES).optional(),
  count: z.number().int().min(MIN_FLUX_BATCH).max(MAX_FLUX_BATCH).optional(),
  width: z.number().int().min(256).max(1536).optional(),
  height: z.number().int().min(256).max(1536).optional(),
  steps: z.number().int().min(1).max(50).optional(),
  cfgScale: z.number().min(0).max(20).optional(),
  /** -1 asks for a random seed. */
  seed: z.number().int().min(-1).max(2_147_483_647).optional(),
});

const sourceImageDataUrl = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i,
    'Upload an image (png, jpeg, webp, gif or bmp)',
  )
  // Roughly 12 MB of bytes once decoded, which covers a phone photo.
  .max(16_000_000, 'That image is too large');

export const fluxEditSchema = z
  .object({
    prompt: z.string().min(1, 'Describe the change you want').max(1500),
    /** Gallery image to edit; give this or `image`, not neither. */
    imageId: z.number().int().positive().optional(),
    image: sourceImageDataUrl.optional(),
    count: z.number().int().min(MIN_FLUX_BATCH).max(MAX_FLUX_BATCH).optional(),
    steps: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().min(-1).max(2_147_483_647).optional(),
  })
  .refine((value) => Boolean(value.imageId) !== Boolean(value.image), {
    message: 'Provide either an image to upload or the id of one already in the gallery',
    path: ['image'],
  });

export const fluxUpscaleSchema = z.object({
  /** Upscaler file name; defaults to the configured one. */
  model: z.string().max(200).optional(),
  /** Follow the upscale with a diffusion pass that adds real detail. */
  refine: z.boolean().optional(),
});

export const fluxConfigSchema = z
  .object({
    backend: z.enum(FLUX_BACKENDS),
    model: z.string().min(1).max(200),
    clipL: z.string().max(200),
    t5: z.string().max(200),
    llm: z.string().max(200),
    vae: z.string().min(1).max(200),
    upscaleModel: z.string().max(200),
    refineStrength: z.number().min(0).max(1),
    refineSteps: z.number().int().min(1).max(50),
    steps: z.number().int().min(1).max(50),
    cfgScale: z.number().min(0).max(20),
    width: z.number().int().min(256).max(1536),
    height: z.number().int().min(256).max(1536),
    sampler: z.string().min(1).max(40),
    threads: z.number().int().min(-1).max(64),
    diffusionFlashAttention: z.boolean(),
    vaeTiling: z.boolean(),
    offloadToCpu: z.boolean(),
    keepUnsavedDays: z.number().int().min(0).max(365),
  })
  .partial();

export const aiSettingsSchema = z
  .object({
    provider: z.enum(AI_PROVIDERS),
    sttProvider: z.enum(STT_PROVIDERS),
    model: z.string().max(120),
    language: z.enum(['tr', 'en']),
    ttsVoice: z.string().min(1).max(80),
    wakeWord: z.string().min(2).max(32),
    persona: z.string().max(2000),
    speakReplies: z.boolean(),
    memoryTurns: z.number().int().min(0).max(30),
  })
  .partial();

export const aiChatSchema = z.object({
  guildId: snowflake.optional(),
  message: z.string().min(1).max(2000),
});

export const presenceSchema = z
  .object({
    status: z.enum(PRESENCE_STATUSES),
    activityType: z.enum(ACTIVITY_TYPES),
    activityName: z.string().max(128),
    activityUrl: z.url().max(500).nullable(),
    showNowPlaying: z.boolean(),
  })
  .partial();

/** Data URLs are used so avatars can be sent as plain JSON. */
const imageDataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image format');

export const botProfileUpdateSchema = z
  .object({
    username: z.string().min(2).max(32),
    description: z.string().max(400),
    avatar: imageDataUrl.nullable(),
    banner: imageDataUrl.nullable(),
    tags: z.array(z.string().min(1).max(20)).max(5),
  })
  .partial();

export const voiceListenSchema = z.object({
  guildId: snowflake,
  voiceChannelId: snowflake.optional(),
  enabled: z.boolean(),
});

export const ttsSpeakSchema = z.object({
  guildId: snowflake,
  text: z.string().min(1).max(1000),
  voiceChannelId: snowflake.optional(),
  /** Registry id of the voice to use; the default voice is used when absent. */
  voiceId: z.number().int().positive().optional(),
});

export const ttsVoiceInputSchema = z.object({
  name: z.string().min(1).max(60),
  provider: z.enum(TTS_PROVIDERS),
  voiceId: z.string().min(1).max(120),
  language: z.string().max(20).optional(),
  gender: z.string().max(20).optional(),
  description: z.string().max(200).optional(),
  command: z.string().max(500).optional(),
  commandArgs: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const ttsVoiceUpdateSchema = ttsVoiceInputSchema.partial();

export type LoginInput = z.infer<typeof loginSchema>;
export type PlayRequestInput = z.infer<typeof playRequestSchema>;
export type GuildSettingsPatch = z.infer<typeof guildSettingsUpdateSchema>;
export type AiSettingsPatch = z.infer<typeof aiSettingsSchema>;
export type PresencePatch = z.infer<typeof presenceSchema>;
export type BotProfilePatch = z.infer<typeof botProfileUpdateSchema>;
