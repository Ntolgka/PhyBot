import type { BuiltinCommandInfo } from '@phybot/shared';
import { assistantCommands } from './assistant.js';
import { communityCommands } from './community.js';
import { configCommands } from './config.js';
import { musicCommands } from './music.js';
import { queueCommands } from './queue.js';
import { imagineCommands } from './imagine.js';
import { soundboardCommands } from './soundboard.js';
import { turksigaraCommands } from './turksigara.js';
import { utilityCommands } from './utility.js';
import type { BotCommand } from './types.js';

class CommandRegistry {
  private readonly commands = new Map<string, BotCommand>();

  constructor(commands: BotCommand[]) {
    for (const command of commands) {
      this.commands.set(command.data.name, command);
    }
  }

  get(name: string): BotCommand | undefined {
    return this.commands.get(name);
  }

  all(): BotCommand[] {
    return [...this.commands.values()];
  }

  /** Command reference shown in /help and in the dashboard. */
  describe(): BuiltinCommandInfo[] {
    return this.all().map((command) => ({
      name: command.data.name,
      description: command.data.description,
      category: command.category,
      usage: command.usage,
    }));
  }

  toJSON(): unknown[] {
    return this.all().map((command) => command.data.toJSON());
  }
}

export const commandRegistry = new CommandRegistry([
  ...musicCommands,
  ...queueCommands,
  ...soundboardCommands,
  ...imagineCommands,
  ...communityCommands,
  ...configCommands,
  ...assistantCommands,
  ...turksigaraCommands,
  ...utilityCommands,
]);

export type { BotCommand } from './types.js';
