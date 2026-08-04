export interface RolePanelOption {
  roleId: string;
  label: string;
  description: string;
  emoji: string | null;
}

export interface RolePanel {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  /** Users may only hold one role from the panel at a time. */
  exclusive: boolean;
  options: RolePanelOption[];
  createdAt: number;
  updatedAt: number;
}

export interface RolePanelInput {
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  exclusive?: boolean;
  options: RolePanelOption[];
}
