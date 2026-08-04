import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type EmbedBuilder,
  type InteractionReplyOptions,
  type RepliableInteraction,
} from 'discord.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('discord');

type AnyInteraction = RepliableInteraction | ChatInputCommandInteraction | ButtonInteraction;

/** Replies or edits depending on whether the interaction was already deferred. */
export async function respond(
  interaction: AnyInteraction,
  options: InteractionReplyOptions,
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: options.content ?? null,
        embeds: options.embeds ?? [],
        components: options.components ?? [],
      });
      return;
    }
    await interaction.reply(options);
  } catch (error) {
    // Interactions expire after 15 minutes; losing the reply must not crash.
    log.warn({ err: error }, 'Could not deliver interaction response');
  }
}

export function embedReply(
  interaction: AnyInteraction,
  embed: EmbedBuilder,
  ephemeral = false,
): Promise<void> {
  return respond(interaction, {
    embeds: [embed],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
  });
}
