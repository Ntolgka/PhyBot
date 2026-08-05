import { EventEmitter } from 'node:events';
import type {
  AiRuntimeStatus,
  AiSettings,
  AiVoiceEvent,
  BotProfile,
  BotStatus,
  FluxProgress,
  FluxStatus,
  FreeGamesStatus,
  GuildEvent,
  GuildSettings,
  GuildSummary,
  PlayerSnapshot,
} from '@phybot/shared';

/**
 * Internal publish/subscribe bus. Feature modules publish state changes here
 * and the websocket layer forwards them to the dashboard, so no module needs
 * to know about the API server.
 */
export interface AppEvents {
  'player:update': [PlayerSnapshot];
  'player:removed': [{ guildId: string }];
  'bot:status': [BotStatus];
  'bot:profile': [BotProfile];
  'guilds:update': [GuildSummary[]];
  'settings:update': [GuildSettings];
  'event:update': [GuildEvent];
  'event:removed': [{ id: number }];
  'freegames:update': [FreeGamesStatus];
  'ai:status': [AiRuntimeStatus];
  'ai:settings': [AiSettings];
  'ai:voice': [AiVoiceEvent];
  'flux:progress': [FluxProgress];
  'flux:status': [FluxStatus];
  notice: [{ level: 'info' | 'warn' | 'error'; message: string }];
}

class TypedEmitter extends EventEmitter<AppEvents> {}

export const bus = new TypedEmitter();

// Feature modules, the websocket hub and the Discord layer all subscribe.
bus.setMaxListeners(50);
