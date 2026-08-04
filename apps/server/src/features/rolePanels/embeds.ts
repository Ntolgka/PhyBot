import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { RolePanel } from '@phybot/shared';
import { truncate } from '@phybot/shared';

const PANEL_COLOR = 0x7c5cff;
const MAX_BUTTONS = 25;
const BUTTONS_PER_ROW = 5;

export const ROLE_PANEL_BUTTON_PREFIX = 'rolepanel';

export function rolePanelButtonId(panelId: number, roleId: string): string {
  return `${ROLE_PANEL_BUTTON_PREFIX}:${panelId}:${roleId}`;
}

export function rolePanelEmbed(panel: RolePanel): EmbedBuilder {
  const optionLines = panel.options
    .slice(0, MAX_BUTTONS)
    .map((option) => {
      const emoji = option.emoji ? `${option.emoji} ` : '';
      const description = option.description ? ` — ${option.description}` : '';
      return `${emoji}**${option.label}**${description}`;
    })
    .join('\n');

  const description = [panel.description, optionLines].filter(Boolean).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(truncate(panel.title, 100))
    .setDescription(truncate(description, 4000));

  if (panel.exclusive) {
    embed.setFooter({ text: 'Pick one role from this panel - selecting another swaps it.' });
  }
  return embed;
}

export function rolePanelComponents(panel: RolePanel): ActionRowBuilder<ButtonBuilder>[] {
  const options = panel.options.slice(0, MAX_BUTTONS);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let i = 0; i < options.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const option of options.slice(i, i + BUTTONS_PER_ROW)) {
      const button = new ButtonBuilder()
        .setCustomId(rolePanelButtonId(panel.id, option.roleId))
        .setLabel(truncate(option.label, 80))
        .setStyle(ButtonStyle.Secondary);
      if (option.emoji) button.setEmoji(option.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }
  return rows;
}
