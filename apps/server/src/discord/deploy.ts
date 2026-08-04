import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { CustomCommand } from '@phybot/shared';
import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { commandsRepository } from '../db/repositories/commands.js';
import { soundRepository } from '../soundboard/repository.js';
import { commandRegistry } from './commands/index.js';
import { tryGetClient } from './client.js';

const log = createLogger('commands');

function customCommandToJson(command: CustomCommand): unknown {
  return new SlashCommandBuilder()
    .setName(command.name)
    .setDescription(command.description || `Custom command: ${command.name}`)
    .toJSON();
}

/**
 * Guild level commands are the custom text commands plus every soundboard clip
 * that asked for its own command. Names are unique per guild, and a clip never
 * overrides a text command with the same name.
 */
function guildCommandsToJson(guildId: string): unknown[] {
  const custom = commandsRepository
    .list(guildId)
    .filter((command) => command.enabled && command.slash);
  const taken = new Set(custom.map((command) => command.name));

  const sounds = soundRepository
    .list(guildId)
    .filter((sound) => sound.slash && !taken.has(sound.name))
    .map((sound) =>
      new SlashCommandBuilder()
        .setName(sound.name)
        .setDescription(sound.description || `Play the ${sound.name} sound`)
        .toJSON(),
    );

  return [...custom.map(customCommandToJson), ...sounds];
}

/**
 * Built-in commands are registered globally (or in the development guild when
 * one is configured). Custom commands are registered per guild so they appear
 * instantly and only where they are defined.
 */
export async function deployCommands(): Promise<number> {
  const token = config.discord.token;
  const clientId = config.discord.clientId ?? tryGetClient()?.application?.id;
  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const builtin = commandRegistry.toJSON();
  let total = 0;

  if (config.discord.devGuildId) {
    const guildId = config.discord.devGuildId;
    const body = [...builtin, ...guildCommandsToJson(guildId)];
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    log.info(`Registered ${body.length} commands in the development guild`);
    return body.length;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: builtin });
  total += builtin.length;
  log.info(`Registered ${builtin.length} global commands`);

  const client = tryGetClient();
  if (!client) return total;

  for (const guild of client.guilds.cache.values()) {
    const body = guildCommandsToJson(guild.id);
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body });
      total += body.length;
    } catch (error) {
      log.warn(
        { guildId: guild.id },
        `Could not register guild commands: ${toErrorMessage(error)}`,
      );
    }
  }
  return total;
}

/**
 * Refreshes one guild's custom commands and soundboard commands after a
 * dashboard change.
 */
export async function deployGuildCustomCommands(guildId: string): Promise<void> {
  const token = config.discord.token;
  const clientId = config.discord.clientId ?? tryGetClient()?.application?.id;
  if (!token || !clientId) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const guildCommands = guildCommandsToJson(guildId);
  const body =
    config.discord.devGuildId === guildId
      ? [...commandRegistry.toJSON(), ...guildCommands]
      : guildCommands;
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
}
