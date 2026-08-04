import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Sound } from '@phybot/shared';
import { formatDuration, truncate } from '@phybot/shared';
import { soundRepository } from '../../soundboard/repository.js';
import { playSound } from '../../soundboard/service.js';
import { errorEmbed, infoEmbed, successEmbed } from '../embeds.js';
import { embedReply, respond } from '../reply.js';
import { requireVoiceChannel } from './helpers.js';
import type { BotCommand } from './types.js';

function describeSound(sound: Sound): string {
  const emoji = sound.emoji ? `${sound.emoji} ` : '';
  return `${emoji}\`${sound.name}\` — ${formatDuration(sound.durationSeconds)} — ${sound.uses} play${sound.uses === 1 ? '' : 's'}`;
}

function soundNameList(sounds: Sound[]): string {
  return sounds.map((sound) => `\`${sound.name}\``).join(', ');
}

async function playAndReply(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  sound: Sound,
  voiceChannelId: string,
  requestedBy: string,
): Promise<void> {
  await interaction.deferReply();
  await playSound({ guildId, soundId: sound.id, voiceChannelId, requestedBy });
  await respond(interaction, {
    embeds: [
      successEmbed(
        `Playing **${truncate(sound.name, 60)}**${sound.emoji ? ` ${sound.emoji}` : ''}.`,
      ),
    ],
  });
}

const soundCommand: BotCommand = {
  category: 'Music',
  usage: '/sound <name>',
  data: new SlashCommandBuilder()
    .setName('sound')
    .setDescription('Play a soundboard clip in your voice channel')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of the clip, as shown in /sounds')
        .setRequired(true)
        .setMaxLength(32),
    ),
  async execute({ interaction, guild, member }) {
    const voiceChannel = requireVoiceChannel(member);
    const name = interaction.options.getString('name', true).trim().toLowerCase();
    const sound = soundRepository.getByName(guild.id, name);

    if (!sound) {
      const sounds = soundRepository.list(guild.id);
      await embedReply(
        interaction,
        errorEmbed(
          sounds.length > 0
            ? `No clip named \`${name}\`. Available clips: ${soundNameList(sounds)}`
            : 'This server has no soundboard clips yet. Add some from the dashboard.',
          'Unknown sound',
        ),
        true,
      );
      return;
    }

    await playAndReply(interaction, guild.id, sound, voiceChannel.id, member.id);
  },
};

const soundsCommand: BotCommand = {
  category: 'Music',
  usage: '/sounds',
  data: new SlashCommandBuilder()
    .setName('sounds')
    .setDescription('List the soundboard clips available in this server'),
  async execute({ interaction, guild, member }) {
    requireVoiceChannel(member);
    const sounds = soundRepository.list(guild.id);
    if (sounds.length === 0) {
      await embedReply(
        interaction,
        infoEmbed('No soundboard clips yet. Add some from the dashboard.', 'Soundboard'),
      );
      return;
    }
    await embedReply(
      interaction,
      infoEmbed(sounds.map(describeSound).join('\n'), `Soundboard (${sounds.length})`),
    );
  },
};

export const soundboardCommands: BotCommand[] = [soundCommand, soundsCommand];

/**
 * Resolves a sound registered as its own slash command (e.g. `/airhorn`).
 * Only clips with `slash: true` are eligible. Built-in commands and
 * text-based custom commands are looked up first by the interaction router;
 * this should be tried after both come up empty.
 */
export function findSoundCommand(guildId: string, name: string): Sound | null {
  const sound = soundRepository.getByName(guildId, name.toLowerCase());
  return sound && sound.slash ? sound : null;
}

/** Plays a sound resolved via {@link findSoundCommand} in response to its own
 * slash command invocation. */
export async function executeSoundCommand(
  interaction: ChatInputCommandInteraction,
  sound: Sound,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannel = requireVoiceChannel(member);
  await playAndReply(interaction, interaction.guild.id, sound, voiceChannel.id, member.id);
}
