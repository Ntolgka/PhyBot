import { ChannelType, SlashCommandBuilder } from 'discord.js';
import type { GuildSettingsUpdate } from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { settingsRepository } from '../../db/repositories/settings.js';
import { baseEmbed, successEmbed } from '../embeds.js';
import { embedReply } from '../reply.js';
import type { BotCommand } from './types.js';

function save(guildId: string, patch: GuildSettingsUpdate): void {
  const updated = settingsRepository.update(guildId, patch);
  bus.emit('settings:update', updated);
}

const configCommand: BotCommand = {
  category: 'Configuration',
  usage: '/config <view|autorole|welcome|goodbye|freegames|music-channel|dj-role|voice-announce>',
  permission: 'manage',
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the bot for this server')
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the current configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('autorole')
        .setDescription('Role given to members when they join')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Leave empty to turn auto-role off'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Welcome message settings')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Leave empty to turn welcome messages off')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Use {user}, {username}, {server} and {memberCount}')
            .setMaxLength(1500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('goodbye')
        .setDescription('Goodbye message settings')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Leave empty to turn goodbye messages off')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option.setName('message').setDescription('Use {user}, {server}').setMaxLength(1500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('freegames')
        .setDescription('Where free game announcements are posted')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Leave empty to turn announcements off')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to mention for new offers'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('music-channel')
        .setDescription('Where now playing messages are posted')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Leave empty to post in the channel where the command was used')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('dj-role')
        .setDescription('Role required to control playback')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Leave empty so everyone can control playback'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('voice-announce')
        .setDescription('Speak who joins and leaves a voice channel')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Leave empty to switch it to the opposite of what it is now'),
        ),
    ),
  async execute({ interaction, guild, settings }) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'autorole': {
        const role = interaction.options.getRole('role');
        save(guild.id, { autoRoleId: role?.id ?? null, autoRoleEnabled: Boolean(role) });
        await embedReply(
          interaction,
          successEmbed(role ? `New members will get ${role}.` : 'Auto-role is off.'),
          true,
        );
        return;
      }
      case 'welcome':
      case 'goodbye': {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        const isWelcome = sub === 'welcome';
        save(guild.id, {
          [isWelcome ? 'welcomeChannelId' : 'goodbyeChannelId']: channel?.id ?? null,
          [isWelcome ? 'welcomeEnabled' : 'goodbyeEnabled']: Boolean(channel),
          ...(message ? { [isWelcome ? 'welcomeMessage' : 'goodbyeMessage']: message } : {}),
        } as GuildSettingsUpdate);
        await embedReply(
          interaction,
          successEmbed(
            channel
              ? `${isWelcome ? 'Welcome' : 'Goodbye'} messages will be posted in ${channel}.`
              : `${isWelcome ? 'Welcome' : 'Goodbye'} messages are off.`,
          ),
          true,
        );
        return;
      }
      case 'freegames': {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        save(guild.id, {
          freeGamesChannelId: channel?.id ?? null,
          freeGamesEnabled: Boolean(channel),
          freeGamesRoleId: role?.id ?? null,
        });
        await embedReply(
          interaction,
          successEmbed(
            channel
              ? `Free game offers will be posted in ${channel}${role ? ` and will mention ${role}` : ''}.`
              : 'Free game announcements are off.',
          ),
          true,
        );
        return;
      }
      case 'music-channel': {
        const channel = interaction.options.getChannel('channel');
        save(guild.id, { musicTextChannelId: channel?.id ?? null });
        await embedReply(
          interaction,
          successEmbed(
            channel
              ? `Now playing messages will go to ${channel}.`
              : 'Now playing messages follow the command channel.',
          ),
          true,
        );
        return;
      }
      case 'voice-announce': {
        // Omitting the option flips it, so the common case is one word.
        const enabled = interaction.options.getBoolean('enabled') ?? !settings.voiceAnnounceEnabled;
        save(guild.id, { voiceAnnounceEnabled: enabled });
        await embedReply(
          interaction,
          successEmbed(
            enabled
              ? 'The bot will join a voice channel and say who comes in and who leaves.'
              : 'Voice arrivals are no longer announced.',
          ),
          true,
        );
        return;
      }

      case 'dj-role': {
        const role = interaction.options.getRole('role');
        save(guild.id, { djRoleId: role?.id ?? null });
        await embedReply(
          interaction,
          successEmbed(
            role ? `${role} can now control playback.` : 'Everyone can control playback.',
          ),
          true,
        );
        return;
      }
      default: {
        const channelMention = (id: string | null) => (id ? `<#${id}>` : 'not set');
        const roleMention = (id: string | null) => (id ? `<@&${id}>` : 'not set');
        const embed = baseEmbed()
          .setTitle(`Configuration for ${guild.name}`)
          .addFields(
            {
              name: 'Members',
              value: [
                `Auto-role: ${settings.autoRoleEnabled ? roleMention(settings.autoRoleId) : 'off'}`,
                `Welcome: ${settings.welcomeEnabled ? channelMention(settings.welcomeChannelId) : 'off'}`,
                `Goodbye: ${settings.goodbyeEnabled ? channelMention(settings.goodbyeChannelId) : 'off'}`,
              ].join('\n'),
            },
            {
              name: 'Music',
              value: [
                `DJ role: ${roleMention(settings.djRoleId)}`,
                `Now playing channel: ${channelMention(settings.musicTextChannelId)}`,
                `Default volume: ${settings.defaultVolume}%`,
                `Idle timeout: ${settings.idleTimeoutSeconds}s`,
              ].join('\n'),
            },
            {
              name: 'Free games',
              value: settings.freeGamesEnabled
                ? `${channelMention(settings.freeGamesChannelId)} • stores: ${settings.freeGamesStores.join(', ') || 'none'}`
                : 'off',
            },
            {
              name: 'Events',
              value: `${channelMention(settings.eventsChannelId)} • reminder ${settings.eventReminderMinutes} min before`,
            },
            {
              name: 'Assistant',
              value: `Text: ${settings.aiEnabled ? 'on' : 'off'} • Voice: ${settings.aiVoiceEnabled ? 'on' : 'off'} • Arrivals: ${settings.voiceAnnounceEnabled ? 'on' : 'off'}`,
            },
          )
          .setFooter({ text: 'Full configuration is available in the web dashboard.' });
        await embedReply(interaction, embed, true);
      }
    }
  },
};

export const configCommands: BotCommand[] = [configCommand];
