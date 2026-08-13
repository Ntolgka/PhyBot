export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  /** True while a voice connection for this guild exists. */
  hasPlayer: boolean;
}

export interface ChannelSummary {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'stage' | 'forum' | 'announcement' | 'category' | 'other';
  parentName: string | null;
  /** False when the bot lacks permission to post or connect. */
  usable: boolean;
}

/** Why the bot cannot hand out a role, so the dashboard can say what to fix. */
export type RoleBlockReason = 'managed' | 'above_bot' | 'missing_permission';

export interface RoleSummary {
  id: string;
  name: string;
  color: string;
  position: number;
  /** False when the bot cannot currently give this role to a member. */
  assignable: boolean;
  managed: boolean;
  /** Set only when `assignable` is false. */
  blockedBy?: RoleBlockReason;
}

export interface MemberSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bot: boolean;
}

export interface GuildSettings {
  guildId: string;
  /** Prefix for the optional message-based commands. */
  prefix: string;
  /** Locale used for bot replies in this guild. */
  locale: 'tr' | 'en';
  djRoleId: string | null;
  /** Role automatically granted to members who join. */
  autoRoleId: string | null;
  autoRoleEnabled: boolean;
  /** Role granted to bots that join, when set. */
  autoRoleBotId: string | null;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  musicTextChannelId: string | null;
  /** Where the daily turksigara picture is posted, or null to not post one. */
  turksigaraChannelId: string | null;
  /** Time of day for that post, as 24 hour HH:MM. */
  turksigaraTime: string;
  /** IANA zone the time is read in, so the hour holds across daylight saving. */
  turksigaraTimezone: string;
  /**
   * Keep a live panel in the music text channel showing the current track,
   * the queue and the playback buttons.
   */
  announceNowPlaying: boolean;
  defaultVolume: number;
  /** Leave the voice channel after this many seconds without listeners. */
  idleTimeoutSeconds: number;
  freeGamesEnabled: boolean;
  freeGamesChannelId: string | null;
  freeGamesRoleId: string | null;
  freeGamesStores: string[];
  eventsChannelId: string | null;
  eventReminderMinutes: number;
  aiEnabled: boolean;
  aiVoiceEnabled: boolean;
  /** Speak a line in the voice channel when someone joins or leaves it. */
  voiceAnnounceEnabled: boolean;
  aiTextChannelId: string | null;
  updatedAt: number;
}

export type GuildSettingsUpdate = Partial<Omit<GuildSettings, 'guildId' | 'updatedAt'>>;
