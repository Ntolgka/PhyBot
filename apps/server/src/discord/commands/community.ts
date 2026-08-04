import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { truncate } from '@phybot/shared';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { discordTimestamp, parseZonedDateTime } from '../../core/time.js';
import { cancelEvent, createEvent, listEvents, publishEvent } from '../../features/index.js';
import { baseEmbed, infoEmbed, successEmbed } from '../embeds.js';
import { embedReply, respond } from '../reply.js';
import type { BotCommand } from './types.js';

const eventCommand: BotCommand = {
  category: 'Community',
  usage: '/event <create|list|publish|cancel>',
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create and manage server events')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create an event with RSVP buttons')
        .addStringOption((option) =>
          option.setName('title').setDescription('Event title').setRequired(true).setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName('start')
            .setDescription(`Start time as YYYY-MM-DD HH:mm (${config.timezone})`)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('What is it about').setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName('location')
            .setDescription('Voice channel, game or place')
            .setMaxLength(200),
        )
        .addIntegerOption((option) =>
          option
            .setName('capacity')
            .setDescription('Maximum attendees, 0 for unlimited')
            .setMinValue(0),
        )
        .addIntegerOption((option) =>
          option
            .setName('reminder')
            .setDescription('Minutes before the start to ping attendees, 0 to disable')
            .setMinValue(0)
            .setMaxValue(10080),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where to post the event')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Show upcoming events')
        .addBooleanOption((option) =>
          option.setName('past').setDescription('Include events that already happened'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('publish')
        .setDescription('Post or refresh the RSVP message of an event')
        .addIntegerOption((option) =>
          option.setName('id').setDescription('Event id').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel an event')
        .addIntegerOption((option) =>
          option.setName('id').setDescription('Event id').setRequired(true).setMinValue(1),
        ),
    ),
  async execute({ interaction, guild, member, settings }) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const includePast = interaction.options.getBoolean('past') ?? false;
      const events = listEvents(guild.id, includePast);
      if (events.length === 0) {
        await embedReply(
          interaction,
          infoEmbed('There are no events yet. Create one with `/event create`.'),
        );
        return;
      }
      const embed = baseEmbed()
        .setTitle(`Events in ${guild.name}`)
        .setDescription(
          events
            .slice(0, 15)
            .map((event) => {
              const going = event.rsvps.filter((rsvp) => rsvp.status === 'going').length;
              const status = event.cancelled ? ' (cancelled)' : '';
              return `\`#${event.id}\` **${truncate(event.title, 60)}**${status}\n${discordTimestamp(event.startsAt)} • ${going} going`;
            })
            .join('\n\n'),
        );
      await respond(interaction, { embeds: [embed] });
      return;
    }

    if (sub === 'create') {
      const startInput = interaction.options.getString('start', true);
      const startsAt = parseZonedDateTime(startInput, config.timezone);
      if (startsAt === null) {
        throw new AppError(
          'bad_date',
          `Use the format YYYY-MM-DD HH:mm, for example 2026-09-14 21:00 (${config.timezone}).`,
          400,
        );
      }
      if (startsAt <= Date.now()) {
        throw new AppError('past_date', 'The start time has to be in the future.', 400);
      }

      const channel = interaction.options.getChannel('channel');
      const channelId = channel?.id ?? settings.eventsChannelId ?? interaction.channelId;
      await interaction.deferReply();

      const event = await createEvent({
        guildId: guild.id,
        channelId,
        title: interaction.options.getString('title', true),
        description: interaction.options.getString('description') ?? '',
        location: interaction.options.getString('location') ?? '',
        startsAt,
        capacity: interaction.options.getInteger('capacity') ?? 0,
        reminderMinutes:
          interaction.options.getInteger('reminder') ?? settings.eventReminderMinutes,
        createdBy: member.id,
        createdByName: member.displayName,
      });

      await respond(interaction, {
        embeds: [
          successEmbed(
            `Created **${truncate(event.title, 80)}** (\`#${event.id}\`) for ${discordTimestamp(event.startsAt)} in <#${event.channelId}>.`,
          ),
        ],
      });
      return;
    }

    const id = interaction.options.getInteger('id', true);
    await interaction.deferReply();

    if (sub === 'publish') {
      const event = await publishEvent(id);
      await respond(interaction, {
        embeds: [successEmbed(`Posted **${truncate(event.title, 80)}** in <#${event.channelId}>.`)],
      });
      return;
    }

    const event = await cancelEvent(id);
    await respond(interaction, {
      embeds: [successEmbed(`Cancelled **${truncate(event.title, 80)}**.`)],
    });
  },
};

export const communityCommands: BotCommand[] = [eventCommand];
