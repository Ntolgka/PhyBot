import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type EmbedBuilder,
} from 'discord.js';
import type { FluxGenerationResult, FluxImage, FluxStatus } from '@phybot/shared';
import { MAX_FLUX_BATCH, MIN_FLUX_BATCH, truncate } from '@phybot/shared';
import {
  generateImages,
  getFluxStatus,
  getImage,
  imageFilePath,
  saveImage,
  upscaleImage,
} from '../../flux/index.js';
import { baseEmbed, errorEmbed, infoEmbed, successEmbed } from '../embeds.js';
import type { BotCommand } from './types.js';

const CUSTOM_ID_PREFIX = 'flux:';
const UPSCALE_ID = /^flux:upscale:(\d+)$/;
const SAVE_ID = /^flux:save:(\d+)$/;

function setupMessage(status: FluxStatus): string {
  if (!status.installed) {
    return 'The FLUX image engine is not installed yet. Run `npm run flux:setup` in the project folder, then try again.';
  }
  const missing = status.missing.length > 0 ? status.missing.join(', ') : 'required model files';
  return `FLUX is missing some model files: ${missing}. Run \`npm run flux:setup\` in the project folder, then try again.`;
}

function buildEmbed(result: FluxGenerationResult): EmbedBuilder {
  const first = result.images[0];
  const seeds = [...new Set(result.images.map((image) => image.seed))];
  const embed = baseEmbed()
    .setTitle('Imagine')
    .setDescription(truncate(first?.prompt ?? '', 500));

  if (first) {
    embed.addFields(
      { name: 'Seed', value: seeds.join(', '), inline: true },
      { name: 'Size', value: `${first.width}×${first.height}`, inline: true },
      { name: 'Images', value: String(result.images.length), inline: true },
    );
  }
  if (first?.negativePrompt) {
    embed.addFields({ name: 'Negative prompt', value: truncate(first.negativePrompt, 300) });
  }
  return embed;
}

function buildAttachments(images: FluxImage[]): AttachmentBuilder[] {
  return images.map(
    (image, index) =>
      new AttachmentBuilder(imageFilePath(image), { name: `imagine-${index + 1}.png` }),
  );
}

function buildComponents(images: FluxImage[]): ActionRowBuilder<ButtonBuilder>[] {
  const upscaleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    images.map((image, index) =>
      new ButtonBuilder()
        .setCustomId(`flux:upscale:${image.id}`)
        .setLabel(`U${index + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(image.upscaledFileName !== null),
    ),
  );
  const saveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    images.map((image, index) =>
      new ButtonBuilder()
        .setCustomId(`flux:save:${image.id}`)
        .setLabel(`S${index + 1}`)
        .setStyle(image.saved ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(image.saved),
    ),
  );
  return [upscaleRow, saveRow];
}

const imagineCommand: BotCommand = {
  category: 'AI',
  usage: '/imagine <prompt> [count] [negative] [seed]',
  data: new SlashCommandBuilder()
    .setName('imagine')
    .setDescription('Generate images locally with FLUX')
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Describe the image you want')
        .setRequired(true)
        .setMaxLength(1500),
    )
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many images to generate (1-4, default 1)')
        .setMinValue(MIN_FLUX_BATCH)
        .setMaxValue(MAX_FLUX_BATCH),
    )
    .addStringOption((option) =>
      option
        .setName('negative')
        .setDescription('What to avoid; only works when guidance is raised above 1 in the settings')
        .setMaxLength(1000),
    )
    .addIntegerOption((option) =>
      option
        .setName('seed')
        .setDescription('Fixed seed for a reproducible result')
        .setMinValue(-1)
        .setMaxValue(2_147_483_647),
    ),
  async execute({ interaction, member }) {
    const status = getFluxStatus();
    if (!status.installed || !status.modelsReady) {
      await interaction.reply({
        embeds: [errorEmbed(setupMessage(status), 'FLUX is not set up yet')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const prompt = interaction.options.getString('prompt', true);
    const negativePrompt = interaction.options.getString('negative');
    const count = interaction.options.getInteger('count') ?? 1;
    const seed = interaction.options.getInteger('seed');

    await interaction.deferReply();

    const result = await generateImages({
      prompt,
      count,
      requestedBy: member.id,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(seed !== null ? { seed } : {}),
    });

    await interaction.editReply({
      embeds: [buildEmbed(result)],
      files: buildAttachments(result.images),
      components: buildComponents(result.images),
    });
  },
};

export const imagineCommands: BotCommand[] = [imagineCommand];

async function handleUpscale(interaction: ButtonInteraction, imageId: number): Promise<void> {
  const existing = getImage(imageId);
  if (existing.upscaledFileName) {
    await interaction.reply({
      embeds: [infoEmbed('This image has already been upscaled.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  const upscaled = await upscaleImage(imageId);
  await interaction.editReply({
    embeds: [successEmbed(`Upscaled version of image #${upscaled.id}.`)],
    files: [
      new AttachmentBuilder(imageFilePath(upscaled, 'upscaled'), {
        name: `imagine-${upscaled.id}-upscaled.png`,
      }),
    ],
  });
}

async function handleSave(interaction: ButtonInteraction, imageId: number): Promise<void> {
  const existing = getImage(imageId);
  if (existing.saved) {
    await interaction.reply({
      embeds: [infoEmbed('This image is already saved.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await saveImage(imageId);
  await interaction.reply({
    embeds: [successEmbed('Saved. It will be kept when old generations are cleaned up.')],
    flags: MessageFlags.Ephemeral,
  });
}

/** Handles the Upscale/Save buttons attached to an /imagine reply. Wired into
 * the interaction router for every custom id starting with "flux:". */
export async function handleFluxButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return;

  const upscaleMatch = UPSCALE_ID.exec(interaction.customId);
  if (upscaleMatch?.[1]) {
    await handleUpscale(interaction, Number(upscaleMatch[1]));
    return;
  }

  const saveMatch = SAVE_ID.exec(interaction.customId);
  if (saveMatch?.[1]) {
    await handleSave(interaction, Number(saveMatch[1]));
  }
}
