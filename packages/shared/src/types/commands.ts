export const CUSTOM_COMMAND_TYPES = ['text', 'embed', 'random'] as const;
export type CustomCommandType = (typeof CUSTOM_COMMAND_TYPES)[number];

export interface CustomCommand {
  id: number;
  guildId: string;
  /** Lowercase command name without prefix or slash. */
  name: string;
  description: string;
  type: CustomCommandType;
  /** Plain text, embed description, or newline separated pool for "random". */
  content: string;
  embedTitle: string | null;
  embedColor: string | null;
  embedImageUrl: string | null;
  /** Restrict usage to a role; null means everyone. */
  requiredRoleId: string | null;
  /** Also expose the command as a Discord slash command. */
  slash: boolean;
  enabled: boolean;
  uses: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomCommandInput {
  guildId: string;
  name: string;
  description?: string;
  type?: CustomCommandType;
  content: string;
  embedTitle?: string | null;
  embedColor?: string | null;
  embedImageUrl?: string | null;
  requiredRoleId?: string | null;
  slash?: boolean;
  enabled?: boolean;
}

export interface BuiltinCommandInfo {
  name: string;
  description: string;
  category: string;
  /** Argument summary, for the dashboard command reference. */
  usage: string;
}
