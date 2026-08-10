import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AI_PROVIDERS, MAX_VOLUME, MIN_VOLUME, STT_PROVIDERS } from '@phybot/shared';

/** Repository root, resolved from this file so the app is location independent. */
export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Placeholder shipped in .env.example; refuse to use it as a real password. */
const PLACEHOLDER_PASSWORD = 'change-me-before-first-run';

function loadEnvFile(): void {
  const envPath = resolve(rootDir, '.env');
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    console.warn(`[phybot] Could not read .env: ${(error as Error).message}`);
  }
}

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const booleanish = z
  .string()
  .trim()
  .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()));

const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  DISCORD_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_OWNER_ID: optionalString,
  DISCORD_DEV_GUILD_ID: optionalString,

  WEB_PORT: port.default(8420),
  WEB_HOST: z.string().trim().default('127.0.0.1'),
  DASHBOARD_PASSWORD: optionalString,
  SESSION_SECRET: optionalString,

  DATA_DIR: z.string().trim().default('./data'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TIMEZONE: z.string().trim().default('Europe/Istanbul'),

  SPOTIFY_CLIENT_ID: optionalString,
  SPOTIFY_CLIENT_SECRET: optionalString,
  SPOTIFY_REDIRECT_URI: optionalString,
  YOUTUBE_COOKIES_FILE: optionalString,
  YOUTUBE_FORCE_IPV4: booleanish.default(false),
  MUSIC_DEFAULT_VOLUME: z.coerce.number().int().min(MIN_VOLUME).max(MAX_VOLUME).default(100),
  MUSIC_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),

  AI_PROVIDER: z.enum(AI_PROVIDERS).default('none'),
  AI_STT_PROVIDER: z.enum(STT_PROVIDERS).default('none'),
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().trim().default('gemini-flash-latest'),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: z.string().trim().default('llama-3.3-70b-versatile'),
  GROQ_STT_MODEL: z.string().trim().default('whisper-large-v3-turbo'),
  OLLAMA_HOST: z.string().trim().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().default('llama3.1:8b'),
  AI_TTS_VOICE: z.string().trim().default('tr-TR-EmelNeural'),
  AI_LANGUAGE: z.enum(['tr', 'en']).default('tr'),
  AI_WAKE_WORD: z.string().trim().default('fay'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEV_WEB_ORIGIN: optionalString,
  ALLOW_INSECURE_DASHBOARD: booleanish.default(false),
});

export interface AppConfig {
  isProduction: boolean;
  dataDir: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  timezone: string;
  discord: {
    token: string | undefined;
    clientId: string | undefined;
    ownerId: string | undefined;
    devGuildId: string | undefined;
    /** False when the bot cannot start because credentials are missing. */
    configured: boolean;
  };
  web: {
    host: string;
    port: number;
    password: string | undefined;
    sessionSecret: string | undefined;
    devOrigin: string | undefined;
    /** Allows binding to a non-loopback host without a password (not advised). */
    allowInsecure: boolean;
  };
  music: {
    spotifyClientId: string | undefined;
    spotifyClientSecret: string | undefined;
    /** Where Spotify sends the owner back after linking an account. */
    spotifyRedirectUri: string;
    cookiesFile: string | undefined;
    forceIpv4: boolean;
    defaultVolume: number;
    idleTimeoutSeconds: number;
  };
  ai: {
    provider: (typeof AI_PROVIDERS)[number];
    sttProvider: (typeof STT_PROVIDERS)[number];
    geminiApiKey: string | undefined;
    geminiModel: string;
    groqApiKey: string | undefined;
    groqModel: string;
    groqSttModel: string;
    ollamaHost: string;
    ollamaModel: string;
    ttsVoice: string;
    language: 'tr' | 'en';
    wakeWord: string;
  };
}

export class ConfigError extends Error {}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'config'}: ${issue.message}`)
    .join('\n');
}

/** Addresses that mean "listen everywhere" and cannot be dialled by a browser. */
const WILDCARD_HOSTS = new Set(['localhost', '0.0.0.0', '::', '[::]']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration in .env:\n${formatIssues(parsed.error)}`);
  }
  const value = parsed.data;

  const dataDir = isAbsolute(value.DATA_DIR) ? value.DATA_DIR : resolve(rootDir, value.DATA_DIR);
  const password =
    value.DASHBOARD_PASSWORD === PLACEHOLDER_PASSWORD ? undefined : value.DASHBOARD_PASSWORD;

  const cookiesFile = value.YOUTUBE_COOKIES_FILE
    ? isAbsolute(value.YOUTUBE_COOKIES_FILE)
      ? value.YOUTUBE_COOKIES_FILE
      : resolve(rootDir, value.YOUTUBE_COOKIES_FILE)
    : undefined;

  return {
    isProduction: value.NODE_ENV === 'production',
    dataDir,
    logLevel: value.LOG_LEVEL,
    timezone: value.TIMEZONE,
    discord: {
      token: value.DISCORD_TOKEN,
      clientId: value.DISCORD_CLIENT_ID,
      ownerId: value.DISCORD_OWNER_ID,
      devGuildId: value.DISCORD_DEV_GUILD_ID,
      configured: Boolean(value.DISCORD_TOKEN && value.DISCORD_CLIENT_ID),
    },
    web: {
      host: value.WEB_HOST,
      port: value.WEB_PORT,
      password,
      sessionSecret: value.SESSION_SECRET,
      devOrigin: value.DEV_WEB_ORIGIN,
      allowInsecure: value.ALLOW_INSECURE_DASHBOARD,
    },
    music: {
      spotifyClientId: value.SPOTIFY_CLIENT_ID,
      spotifyClientSecret: value.SPOTIFY_CLIENT_SECRET,
      // Spotify only accepts loopback addresses over plain http, so the
      // default is built from the dashboard host and port. A wildcard bind is
      // a listening address rather than one a browser can be sent to, so it
      // falls back to loopback as well; opening the dashboard from another
      // machine means setting SPOTIFY_REDIRECT_URI explicitly.
      spotifyRedirectUri:
        value.SPOTIFY_REDIRECT_URI ??
        `http://${WILDCARD_HOSTS.has(value.WEB_HOST) ? '127.0.0.1' : value.WEB_HOST}:${value.WEB_PORT}/api/spotify/callback`,
      cookiesFile: cookiesFile && existsSync(cookiesFile) ? cookiesFile : undefined,
      forceIpv4: value.YOUTUBE_FORCE_IPV4,
      defaultVolume: value.MUSIC_DEFAULT_VOLUME,
      idleTimeoutSeconds: value.MUSIC_IDLE_TIMEOUT_SECONDS,
    },
    ai: {
      provider: value.AI_PROVIDER,
      sttProvider: value.AI_STT_PROVIDER,
      geminiApiKey: value.GEMINI_API_KEY,
      geminiModel: value.GEMINI_MODEL,
      groqApiKey: value.GROQ_API_KEY,
      groqModel: value.GROQ_MODEL,
      groqSttModel: value.GROQ_STT_MODEL,
      ollamaHost: value.OLLAMA_HOST,
      ollamaModel: value.OLLAMA_MODEL,
      ttsVoice: value.AI_TTS_VOICE,
      language: value.AI_LANGUAGE,
      wakeWord: value.AI_WAKE_WORD.toLowerCase(),
    },
  };
}

loadEnvFile();

export const config = loadConfig();
