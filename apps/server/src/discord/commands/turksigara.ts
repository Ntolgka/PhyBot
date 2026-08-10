import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { truncate } from '@phybot/shared';
import { fetchImage, postByIndex, randomPost } from '../../features/turksigara/client.js';
import { baseEmbed } from '../embeds.js';
import { respond } from '../reply.js';
import type { BotCommand } from './types.js';

const turksigaraCommand: BotCommand = {
  category: 'Fun',
  usage: '/turksigara [numara]',
  data: new SlashCommandBuilder()
    .setName('turksigara')
    .setDescription('Rastgele bir türksigara.net görseli gönderir')
    .addIntegerOption((option) =>
      option
        .setName('numara')
        .setDescription('Belirli bir gönderi numarası, boş bırakılırsa rastgele')
        .setMinValue(1),
    ),
  async execute({ interaction }) {
    // The archive fetch plus the post fetch can take a couple of seconds.
    await interaction.deferReply();
    const requested = interaction.options.getInteger('numara');
    const post = requested === null ? await randomPost() : await postByIndex(requested);

    const embed = baseEmbed()
      .setAuthor({ name: 'türksigara.net', url: post.pageUrl })
      .setTitle(`#${post.index}`)
      .setURL(post.pageUrl)
      .setDescription(truncate(post.title, 300));

    // The picture is uploaded rather than linked, so it shows even though the
    // site's own image URL redirects through a host Discord will not follow.
    const image = await fetchImage(post);
    if (image) {
      await respond(interaction, {
        embeds: [embed.setImage(`attachment://${image.fileName}`)],
        files: [new AttachmentBuilder(image.data, { name: image.fileName })],
      });
      return;
    }

    await respond(interaction, { embeds: [embed.setImage(post.imageUrl)] });
  },
};

export const turksigaraCommands: BotCommand[] = [turksigaraCommand];
