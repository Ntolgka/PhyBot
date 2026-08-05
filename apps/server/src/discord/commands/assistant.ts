import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { truncate } from '@phybot/shared';
import { chat, getAiSettings, isConfigured, setListening, speakInVoice } from '../../ai/index.js';
import { voiceRegistry } from '../../ai/tts/index.js';
import { AppError } from '../../core/errors.js';
import { baseEmbed, successEmbed } from '../embeds.js';
import { embedReply, respond } from '../reply.js';
import { requireVoiceChannel } from './helpers.js';
import type { BotCommand } from './types.js';

function assertConfigured(): void {
  if (!isConfigured()) {
    throw new AppError(
      'ai_disabled',
      'No AI provider is configured yet. Add a Gemini or Groq key (both have free tiers) or run Ollama locally, then set the provider in the dashboard.',
      409,
    );
  }
}

const askCommand: BotCommand = {
  category: 'AI',
  usage: '/ask <question>',
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the assistant a question or tell it what to play')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Your question')
        .setRequired(true)
        .setMaxLength(2000),
    ),
  async execute({ interaction, guild, member }) {
    assertConfigured();
    await interaction.deferReply();
    const generated: string[] = [];
    const reply = await chat({
      message: interaction.options.getString('message', true),
      userId: member.id,
      userName: member.displayName,
      guildId: guild.id,
      channelId: interaction.channelId,
      onGeneratedImages: (paths) => generated.push(...paths),
    });
    await respond(interaction, {
      embeds: [baseEmbed().setDescription(truncate(reply, 4000))],
      files: generated.map((file) => new AttachmentBuilder(file)),
    });
  },
};

const listenCommand: BotCommand = {
  category: 'AI',
  usage: '/listen <on|off>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('listen')
    .setDescription('Let the assistant listen for spoken commands in your voice channel')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Turn listening on or off').setRequired(true),
    ),
  async execute({ interaction, guild, member }) {
    assertConfigured();
    const enabled = interaction.options.getBoolean('enabled', true);
    await interaction.deferReply();

    if (enabled) {
      const channel = requireVoiceChannel(member);
      await setListening({ guildId: guild.id, enabled: true, voiceChannelId: channel.id });
      const wakeWord = getAiSettings().wakeWord;
      await respond(interaction, {
        embeds: [
          successEmbed(
            `Listening in **${channel.name}**. Start a sentence with "${wakeWord}" to give a command.`,
          ),
        ],
      });
      return;
    }

    await setListening({ guildId: guild.id, enabled: false });
    await respond(interaction, { embeds: [successEmbed('Stopped listening.')] });
  },
};

const sayCommand: BotCommand = {
  category: 'AI',
  usage: '/say <text> [voice]',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Speak a sentence in the voice channel')
    .addStringOption((option) =>
      option.setName('text').setDescription('What to say').setRequired(true).setMaxLength(1000),
    )
    .addStringOption((option) =>
      option
        .setName('voice')
        .setDescription('Which voice reads it; the default voice is used when left empty')
        .setAutocomplete(true),
    ),
  async execute({ interaction, guild, member }) {
    const channel = requireVoiceChannel(member);
    const requested = interaction.options.getString('voice');
    const voice = requested ? findVoiceByName(requested) : null;
    if (requested && !voice) {
      throw new AppError(
        'unknown_voice',
        `There is no voice called "${requested}". Add one on the dashboard Speak page.`,
        404,
      );
    }

    await interaction.deferReply();
    await speakInVoice({
      guildId: guild.id,
      text: interaction.options.getString('text', true),
      voiceChannelId: channel.id,
      ...(voice ? { voiceId: voice.id } : {}),
    });
    await embedReply(interaction, successEmbed(voice ? `Spoken with **${voice.name}**.` : 'Done.'));
  },
};

/** Matches a typed or autocompleted voice name against the registry. */
function findVoiceByName(name: string): { id: number; name: string } | null {
  const wanted = name.trim().toLowerCase();
  const match = voiceRegistry
    .list({ enabledOnly: true })
    .find((voice) => voice.name.toLowerCase() === wanted || voice.voiceId.toLowerCase() === wanted);
  return match ? { id: match.id, name: match.name } : null;
}

/** Suggestions for the voice option of /say. */
export function suggestVoices(query: string): { name: string; value: string }[] {
  const wanted = query.trim().toLowerCase();
  return voiceRegistry
    .list({ enabledOnly: true })
    .filter((voice) => !wanted || voice.name.toLowerCase().includes(wanted))
    .slice(0, 25)
    .map((voice) => ({
      name: voice.language ? `${voice.name} (${voice.language})` : voice.name,
      value: voice.name,
    }));
}

export const assistantCommands: BotCommand[] = [askCommand, listenCommand, sayCommand];
