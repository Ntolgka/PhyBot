import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type EmbedBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { FluxGenerationResult, FluxImage, FluxStatus, FluxStyle } from '@phybot/shared';
import {
  FLUX_STYLE_LABEL,
  FLUX_STYLES,
  MAX_FLUX_BATCH,
  MIN_FLUX_BATCH,
  truncate,
} from '@phybot/shared';
import {
  editImage,
  generateImages,
  getFluxConfig,
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
const UPSCALE_PICK_ID = /^flux:upscalepick:(\d+)$/;
/** Discord hands attachments over by URL; this bounds what is fetched. */
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

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
        // Left enabled after an upscale: picking a different upscaler, or the
        // refine pass, is a new request rather than a repeat of the last one.
        .setStyle(image.upscaledFileName ? ButtonStyle.Success : ButtonStyle.Secondary),
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
  usage: '/imagine <prompt> [style] [count] [negative] [seed]',
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
    .addStringOption((option) =>
      option
        .setName('style')
        .setDescription('Pins the look; without one the seed decides between photo and artwork')
        .addChoices(...FLUX_STYLES.map((value) => ({ name: FLUX_STYLE_LABEL[value], value }))),
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
    const style = interaction.options.getString('style') as FluxStyle | null;
    const count = interaction.options.getInteger('count') ?? 1;
    const seed = interaction.options.getInteger('seed');

    await interaction.deferReply();

    const result = await generateImages({
      prompt,
      count,
      requestedBy: member.id,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(style ? { style } : {}),
      ...(seed !== null ? { seed } : {}),
    });

    await interaction.editReply({
      embeds: [buildEmbed(result)],
      files: buildAttachments(result.images),
      components: buildComponents(result.images),
    });
  },
};

const editCommand: BotCommand = {
  category: 'AI',
  usage: '/edit <image> <change> [count] [seed]',
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Change an existing image by describing what should be different')
    .addAttachmentOption((option) =>
      option.setName('image').setDescription('The picture to change').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('change')
        .setDescription('What to change, for example "make the armor golden"')
        .setRequired(true)
        .setMaxLength(1500),
    )
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many versions to make (1-4, default 1)')
        .setMinValue(MIN_FLUX_BATCH)
        .setMaxValue(MAX_FLUX_BATCH),
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

    const attachment = interaction.options.getAttachment('image', true);
    if (!attachment.contentType?.startsWith('image/')) {
      await interaction.reply({
        embeds: [errorEmbed('That attachment is not an image.', 'Wrong file type')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `That image is ${Math.round(attachment.size / 1024 / 1024)} MB; the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
            'Image too large',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const prompt = interaction.options.getString('change', true);
    const count = interaction.options.getInteger('count') ?? 1;
    const seed = interaction.options.getInteger('seed');

    await interaction.deferReply();

    const response = await fetch(attachment.url);
    if (!response.ok) {
      await interaction.editReply({
        embeds: [errorEmbed('Discord would not hand the attachment over.', 'Could not read it')],
      });
      return;
    }
    const imageData = Buffer.from(await response.arrayBuffer());

    const result = await editImage({
      prompt,
      imageData,
      count,
      requestedBy: member.id,
      ...(seed !== null ? { seed } : {}),
    });

    await interaction.editReply({
      embeds: [buildEmbed(result).setTitle('Edit')],
      files: buildAttachments(result.images),
      components: buildComponents(result.images),
    });
  },
};

export const imagineCommands: BotCommand[] = [imagineCommand, editCommand];

/**
 * Offers the upscalers that are actually installed, plus the refine pass. The
 * button used to run whatever was configured, which gave no way to pick a
 * different one for a picture that suited it better.
 */
async function handleUpscale(interaction: ButtonInteraction, imageId: number): Promise<void> {
  const image = getImage(imageId);
  const status = getFluxStatus();
  const config = getFluxConfig();

  const options = status.upscaleModels.map((model) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncate(model, 90))
      .setValue(`plain:${model}`)
      .setDefault(model === config.upscaleModel && !image.upscaleRefined)
      .setDescription(model === config.upscaleModel ? 'Default, fast' : 'Fast'),
  );
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('Refine (sharpest)')
      .setValue(`refine:${config.upscaleModel}`)
      .setDefault(image.upscaleRefined)
      .setDescription('Upscales, then redraws the detail. Takes a couple of minutes.'),
  );

  if (options.length === 1) {
    await interaction.reply({
      embeds: [errorEmbed('No upscaler is installed. Run "npm run flux:setup".', 'Nothing to use')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [infoEmbed(`How should image #${imageId} be upscaled?`)],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`flux:upscalepick:${imageId}`)
          .setPlaceholder('Pick an upscaler')
          // Discord caps a menu at 25 options, which the models directory never
          // comes close to.
          .addOptions(options.slice(0, 25)),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/** Runs the upscaler the user picked from the menu above. */
export async function handleFluxSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const match = UPSCALE_PICK_ID.exec(interaction.customId);
  if (!match?.[1]) return;

  const imageId = Number(match[1]);
  const choice = interaction.values[0] ?? '';
  const separator = choice.indexOf(':');
  const refine = choice.slice(0, separator) === 'refine';
  const model = choice.slice(separator + 1);

  await interaction.update({
    embeds: [
      infoEmbed(refine ? 'Upscaling and redrawing the detail...' : `Upscaling with ${model}...`),
    ],
    components: [],
  });

  const upscaled = await upscaleImage(imageId, { model, refine });
  await interaction.followUp({
    embeds: [
      successEmbed(
        `Upscaled version of image #${upscaled.id}${refine ? ', refined' : ''} (${upscaled.upscaledModel}).`,
      ),
    ],
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
