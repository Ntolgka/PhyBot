import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { FreeGameOffer, GameStore } from '@phybot/shared';
import { truncate } from '@phybot/shared';

const STORE_META: Record<GameStore, { label: string; color: number }> = {
  steam: { label: 'Steam', color: 0x1b2838 },
  epic: { label: 'Epic Games', color: 0x2a2a2a },
  gog: { label: 'GOG', color: 0x86328a },
  ubisoft: { label: 'Ubisoft', color: 0x0070ff },
  itchio: { label: 'itch.io', color: 0xfa5c5c },
  other: { label: 'Free game', color: 0x7c5cff },
};

export function offerEmbed(offer: FreeGameOffer): EmbedBuilder {
  const meta = STORE_META[offer.store];

  const lines: string[] = [];
  if (offer.description) lines.push(truncate(offer.description, 300));
  if (offer.originalPrice) lines.push(`~~${offer.originalPrice}~~ **Free**`);
  if (offer.endsAt) {
    lines.push(`Free until <t:${Math.floor(offer.endsAt / 1000)}:F>`);
  } else if (offer.keepForever) {
    lines.push('Yours to keep once claimed.');
  }

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setAuthor({ name: meta.label })
    .setTitle(truncate(offer.title, 100))
    .setURL(offer.url)
    .setDescription(lines.join('\n') || 'Free for a limited time.')
    .setFooter({ text: 'Free games watcher' })
    .setTimestamp();

  if (offer.imageUrl) embed.setImage(offer.imageUrl);
  return embed;
}

export function claimButtonRow(offer: FreeGameOffer): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Claim now').setStyle(ButtonStyle.Link).setURL(offer.url),
  );
}
