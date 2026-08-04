import type { FastifyInstance } from 'fastify';
import { customCommandInputSchema, customCommandUpdateSchema } from '@phybot/shared';
import { NotFoundError, toErrorMessage } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { commandsRepository } from '../../db/repositories/commands.js';
import { commandRegistry } from '../../discord/commands/index.js';
import { deployGuildCustomCommands } from '../../discord/deploy.js';
import { parseBody } from '../validation.js';

const log = createLogger('commands');

/** Slash registration must not fail the request; report it in the logs. */
async function syncSlashCommands(guildId: string): Promise<void> {
  try {
    await deployGuildCustomCommands(guildId);
  } catch (error) {
    log.warn({ guildId }, `Could not refresh slash commands: ${toErrorMessage(error)}`);
  }
}

export async function commandRoutes(app: FastifyInstance): Promise<void> {
  app.get('/commands/builtin', async () => commandRegistry.describe());

  app.get('/commands', async (request) => {
    const { guildId } = request.query as { guildId?: string };
    return commandsRepository.list(guildId);
  });

  app.post('/commands', async (request) => {
    const body = parseBody(customCommandInputSchema, request.body);
    if (commandRegistry.get(body.name)) {
      throw new NotFoundError(`"${body.name}" is a built-in command name, choose another one`);
    }
    const created = commandsRepository.create(body);
    await syncSlashCommands(created.guildId);
    return created;
  });

  app.patch('/commands/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(customCommandUpdateSchema, request.body);
    const existing = commandsRepository.getById(Number(id));
    if (!existing) throw new NotFoundError('That command does not exist');

    const updated = commandsRepository.update(existing.id, body);
    if (!updated) throw new NotFoundError('That command does not exist');
    await syncSlashCommands(updated.guildId);
    return updated;
  });

  app.delete('/commands/:id', async (request) => {
    const { id } = request.params as { id: string };
    const existing = commandsRepository.getById(Number(id));
    if (!existing) throw new NotFoundError('That command does not exist');
    commandsRepository.delete(existing.id);
    await syncSlashCommands(existing.guildId);
    return { ok: true };
  });
}
