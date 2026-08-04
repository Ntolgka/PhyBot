import { OAuth2Scopes, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { formatDuration, truncate } from '@phybot/shared';
import { requestRestart } from '../../core/lifecycle.js';
import { discordTimestamp } from '../../core/time.js';
import { getFreeGamesStatus, refreshFreeGames } from '../../features/index.js';
import { getStatus } from '../client.js';
import { baseEmbed, infoEmbed, successEmbed } from '../embeds.js';
import { embedReply, respond } from '../reply.js';
import { commandRegistry } from './index.js';
import type { BotCommand } from './types.js';

const helpCommand: BotCommand = {
  category: 'Utility',
  usage: '/help [command]',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List everything the bot can do')
    .addStringOption((option) =>
      option.setName('command').setDescription('Show details for one command'),
    ),
  async execute({ interaction }) {
    const requested = interaction.options.getString('command')?.replace(/^\//, '').toLowerCase();
    const commands = commandRegistry.all();

    if (requested) {
      const command = commands.find((entry) => entry.data.name === requested);
      if (!command) {
        await embedReply(
          interaction,
          infoEmbed(`There is no command called \`/${requested}\`.`),
          true,
        );
        return;
      }
      await embedReply(
        interaction,
        baseEmbed()
          .setTitle(`/${command.data.name}`)
          .setDescription(command.data.description)
          .addFields(
            { name: 'Usage', value: `\`${command.usage}\``, inline: true },
            { name: 'Category', value: command.category, inline: true },
            { name: 'Who can use it', value: command.permission ?? 'everyone', inline: true },
          ),
        true,
      );
      return;
    }

    const grouped = new Map<string, BotCommand[]>();
    for (const command of commands) {
      const list = grouped.get(command.category) ?? [];
      list.push(command);
      grouped.set(command.category, list);
    }

    const embed = baseEmbed()
      .setTitle('PhyBot commands')
      .setDescription('Everything can also be controlled from the web dashboard.');
    for (const [category, list] of grouped) {
      embed.addFields({
        name: category,
        value: list
          .map((command) => `\`/${command.data.name}\` ${command.data.description}`)
          .join('\n'),
      });
    }
    await embedReply(interaction, embed, true);
  },
};

const pingCommand: BotCommand = {
  category: 'Utility',
  usage: '/ping',
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot latency'),
  async execute({ interaction }) {
    const status = getStatus();
    await embedReply(
      interaction,
      infoEmbed(
        `Gateway latency: **${status.ping} ms**\nUptime: **${formatDuration(status.uptimeSeconds)}**`,
      ),
      true,
    );
  },
};

const statsCommand: BotCommand = {
  category: 'Utility',
  usage: '/stats',
  data: new SlashCommandBuilder().setName('stats').setDescription('Show bot statistics'),
  async execute({ interaction }) {
    const status = getStatus();
    await embedReply(
      interaction,
      baseEmbed()
        .setTitle('PhyBot status')
        .addFields(
          { name: 'Servers', value: String(status.guildCount), inline: true },
          { name: 'Members', value: String(status.userCount), inline: true },
          { name: 'Active players', value: String(status.activePlayers), inline: true },
          { name: 'Latency', value: `${status.ping} ms`, inline: true },
          { name: 'Uptime', value: formatDuration(status.uptimeSeconds), inline: true },
          { name: 'Memory', value: `${status.memoryMb} MB`, inline: true },
        )
        .setFooter({ text: `Version ${status.version}` }),
      true,
    );
  },
};

const inviteCommand: BotCommand = {
  category: 'Utility',
  usage: '/invite',
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the link to add the bot to another server'),
  async execute({ interaction }) {
    const url = interaction.client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.ManageRoles,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.MentionEveryone,
      ],
    });
    await embedReply(interaction, infoEmbed(`[Add PhyBot to a server](${url})`), true);
  },
};

const freeGamesCommand: BotCommand = {
  category: 'Utility',
  usage: '/freegames [refresh]',
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Show the games that are free right now')
    .addBooleanOption((option) =>
      option.setName('refresh').setDescription('Fetch the latest offers before answering'),
    ),
  async execute({ interaction }) {
    await interaction.deferReply();
    const status = interaction.options.getBoolean('refresh')
      ? await refreshFreeGames({ announce: false })
      : getFreeGamesStatus();

    if (status.offers.length === 0) {
      await respond(interaction, {
        embeds: [infoEmbed('Nothing is free right now. The bot checks every 30 minutes.')],
      });
      return;
    }

    const embed = baseEmbed()
      .setTitle('Free right now')
      .setDescription(
        status.offers
          .slice(0, 12)
          .map((offer) => {
            const until = offer.endsAt ? ` • until ${discordTimestamp(offer.endsAt, 'R')}` : '';
            return `**${offer.store.toUpperCase()}** [${truncate(offer.title, 60)}](${offer.url})${until}`;
          })
          .join('\n'),
      );
    if (status.lastCheckedAt) {
      embed.setFooter({ text: 'Last checked' }).setTimestamp(status.lastCheckedAt);
    }
    await respond(interaction, { embeds: [embed] });
  },
};

const restartCommand: BotCommand = {
  category: 'Utility',
  usage: '/restart',
  permission: 'owner',
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot, for example after updating it'),
  async execute({ interaction }) {
    const result = requestRestart(`/restart by ${interaction.user.tag}`);
    await embedReply(
      interaction,
      successEmbed(
        result.alreadyRequested
          ? 'A restart is already underway.'
          : [
              'Restarting now. Music stops and the bot reconnects in a few seconds.',
              result.mode === 'supervised'
                ? ''
                : '\nIf it does not come back, start it again from the launcher.',
            ]
              .join('')
              .trim(),
      ),
      true,
    );
  },
};

export const utilityCommands: BotCommand[] = [
  helpCommand,
  restartCommand,
  pingCommand,
  statsCommand,
  inviteCommand,
  freeGamesCommand,
];
