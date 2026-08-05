import type { AiRuntimeStatus, AiSettings, AiVoiceEvent } from './ai.js';
import type { BotProfile, BotStatus, LogEntry, PresenceSettings } from './bot.js';
import type { GuildEvent } from './events.js';
import type { FluxProgress, FluxStatus } from './flux.js';
import type { FreeGamesStatus } from './freegames.js';
import type { GuildSettings, GuildSummary } from './guild.js';
import type { PlayerSnapshot } from './music.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field level validation problems, keyed by field path. */
    details?: Record<string, string>;
  };
}

export interface SessionInfo {
  authenticated: boolean;
  /** Seconds until the current session expires; 0 when signed out. */
  expiresIn: number;
}

export interface DashboardOverview {
  bot: BotStatus;
  profile: BotProfile | null;
  presence: PresenceSettings;
  guilds: GuildSummary[];
  players: PlayerSnapshot[];
  ai: AiRuntimeStatus;
  freeGames: FreeGamesStatus;
}

/** Messages pushed from the server to the dashboard. */
export type ServerMessage =
  | { type: 'hello'; data: { status: BotStatus } }
  | { type: 'bot:status'; data: BotStatus }
  | { type: 'bot:profile'; data: BotProfile }
  | { type: 'player:update'; data: PlayerSnapshot }
  | { type: 'player:removed'; data: { guildId: string } }
  | { type: 'guilds:update'; data: GuildSummary[] }
  | { type: 'settings:update'; data: GuildSettings }
  | { type: 'event:update'; data: GuildEvent }
  | { type: 'event:removed'; data: { id: number } }
  | { type: 'freegames:update'; data: FreeGamesStatus }
  | { type: 'ai:status'; data: AiRuntimeStatus }
  | { type: 'ai:settings'; data: AiSettings }
  | { type: 'ai:voice'; data: AiVoiceEvent }
  | { type: 'flux:progress'; data: FluxProgress }
  | { type: 'flux:status'; data: FluxStatus }
  | { type: 'log'; data: LogEntry }
  | { type: 'notice'; data: { level: 'info' | 'warn' | 'error'; message: string } }
  | { type: 'pong'; data: { at: number } };

/** Messages sent from the dashboard to the server. */
export type ClientMessage =
  { type: 'ping' } | { type: 'subscribe'; data: { guildId: string | null } };

export type ServerMessageType = ServerMessage['type'];
