/** Centralized TanStack Query key factory, kept in one place so the realtime
 * layer (src/hooks/useRealtime.ts) can update the exact same cache entries
 * that the feature hooks read from. */
export const queryKeys = {
  session: ['auth', 'session'] as const,
  overview: ['overview'] as const,
  botStatus: ['bot', 'status'] as const,
  botProfile: ['bot', 'profile'] as const,
  botPresence: ['bot', 'presence'] as const,
  botLogs: (limit: number) => ['bot', 'logs', limit] as const,
  guilds: ['guilds'] as const,
  guildChannels: (guildId: string) => ['guilds', guildId, 'channels'] as const,
  guildRoles: (guildId: string) => ['guilds', guildId, 'roles'] as const,
  guildMembers: (guildId: string, query: string) => ['guilds', guildId, 'members', query] as const,
  guildSettings: (guildId: string) => ['guilds', guildId, 'settings'] as const,
  player: (guildId: string) => ['music', guildId, 'player'] as const,
  search: (q: string, limit: number) => ['music', 'search', q, limit] as const,
  history: (guildId: string, limit: number) => ['music', guildId, 'history', limit] as const,
  topTracks: (guildId: string, limit: number) => ['music', guildId, 'topTracks', limit] as const,
  events: (guildId: string | null, includePast: boolean) =>
    ['events', guildId, includePast] as const,
  commands: (guildId: string | null) => ['commands', guildId] as const,
  builtinCommands: ['commands', 'builtin'] as const,
  sounds: (guildId: string | null) => ['sounds', guildId] as const,
  rolePanels: (guildId: string | null) => ['rolePanels', guildId] as const,
  freeGames: ['freeGames'] as const,
  aiSettings: ['ai', 'settings'] as const,
  aiStatus: ['ai', 'status'] as const,
  aiVoices: ['ai', 'voices'] as const,
  spotifyConnection: ['spotify', 'connection'] as const,
} as const;
