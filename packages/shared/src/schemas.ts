import { z } from 'zod';
import { MAX_VOLUME, MIN_VOLUME } from './constants.js';
import { ACTIVITY_TYPES, PRESENCE_STATUSES } from './types/bot.js';
import { AI_PROVIDERS, STT_PROVIDERS } from './types/ai.js';
import { CUSTOM_COMMAND_TYPES } from './types/commands.js';
import { GAME_STORES } from './types/freegames.js';
import { LOOP_MODES } from './types/music.js';
import { RSVP_STATUSES } from './types/events.js';

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

export const rsvpSchema = z.object({
  userId: snowflake,
  status: z.enum(RSVP_STATUSES),
});

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
  text: z.string().min(1).max(500),
  voiceChannelId: snowflake.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PlayRequestInput = z.infer<typeof playRequestSchema>;
export type GuildSettingsPatch = z.infer<typeof guildSettingsUpdateSchema>;
export type AiSettingsPatch = z.infer<typeof aiSettingsSchema>;
export type PresencePatch = z.infer<typeof presenceSchema>;
export type BotProfilePatch = z.infer<typeof botProfileUpdateSchema>;
