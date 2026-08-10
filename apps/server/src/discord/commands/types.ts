import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { GuildSettings } from '@phybot/shared';

export type CommandCategory =
  'Music' | 'Queue' | 'Community' | 'Configuration' | 'AI' | 'Fun' | 'Utility';

/** Who may run a command, checked before execute(). */
export type CommandPermission = 'everyone' | 'dj' | 'manage' | 'owner';

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  guild: Guild;
  member: GuildMember;
  settings: GuildSettings;
}

export interface BotCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  category: CommandCategory;
  /** Short argument summary shown in /help and the dashboard reference. */
  usage: string;
  permission?: CommandPermission;
  execute(context: CommandContext): Promise<void>;
}
