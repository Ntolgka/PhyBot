/**
 * Registers the slash commands without starting the whole bot.
 * Usage: npm run deploy-commands --workspace @phybot/server
 */
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { getDatabase, closeDatabase } from '../db/database.js';
import { deployCommands } from '../discord/deploy.js';

const log = createLogger('deploy');

getDatabase();

try {
  const count = await deployCommands();
  log.info(`Registered ${count} commands`);
} catch (error) {
  log.error(`Registration failed: ${toErrorMessage(error)}`);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
