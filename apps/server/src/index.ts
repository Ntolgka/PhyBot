import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { stopAll as stopAssistant } from './ai/index.js';
import { startApiServer } from './api/server.js';
import { config } from './core/config.js';
import { RESTART_EXIT_CODE, isSupervised, onRestartRequested } from './core/lifecycle.js';
import { createLogger, logger } from './core/logger.js';
import { toErrorMessage } from './core/errors.js';
import { closeDatabase, getDatabase } from './db/database.js';
import { voiceRegistry } from './ai/tts/index.js';
import { cleanupOldImages, ensureFluxDirectories } from './flux/index.js';
import { sessionsRepository } from './db/repositories/misc.js';
import { APP_VERSION, stopBot } from './discord/client.js';
import { startDiscord } from './discord/index.js';
import { clearAllVoiceStatuses } from './discord/voiceStatus.js';
import { stopFeatureSchedulers } from './features/index.js';
import { playerManager } from './music/manager.js';
import { isYtDlpAvailable } from './music/ytdlp.js';

const log = createLogger('phybot');

let apiServer: FastifyInstance | null = null;
let statusTimer: NodeJS.Timeout | null = null;
let maintenanceTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

async function main(): Promise<void> {
  log.info(`Starting PhyBot ${APP_VERSION}`);

  // Opening the database also applies pending migrations.
  getDatabase();

  if (!isYtDlpAvailable()) {
    log.warn(
      'yt-dlp was not found. Music playback will not work until you run "npm install" again with network access.',
    );
  }

  // Gives the voice pickers something to show on a fresh install.
  voiceRegistry.seed();

  ensureFluxDirectories();
  cleanupOldImages();

  apiServer = await startApiServer();

  const runtime = await startDiscord();
  statusTimer = runtime.statusTimer;

  maintenanceTimer = setInterval(
    () => {
      sessionsRepository.purgeExpired();
      cleanupOldImages();
    },
    60 * 60 * 1000,
  );

  log.info(`Dashboard: http://${config.web.host}:${config.web.port}`);
}

/**
 * Starts a detached copy of this process. Used when nothing is supervising the
 * bot, so a restart from the dashboard still brings it back.
 */
function respawn(): void {
  try {
    // execArgv carries loader flags such as the TypeScript loader used in
    // development; without them the replacement cannot read the sources.
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: 'inherit',
    });
    child.unref();
    log.info('Started a fresh process, this one is exiting');
  } catch (error) {
    log.error(`Could not start the replacement process: ${toErrorMessage(error)}`);
  }
}

async function shutdown(reason: string, options: { restart?: boolean } = {}): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(options.restart ? `Restarting (${reason})` : `Shutting down (${reason})`);

  if (statusTimer) clearInterval(statusTimer);
  if (maintenanceTimer) clearInterval(maintenanceTimer);

  try {
    stopFeatureSchedulers();
    stopAssistant();
    await clearAllVoiceStatuses();
    playerManager.destroyAll();
    await stopBot();
    if (apiServer) await apiServer.close();
  } catch (error) {
    log.warn(`Problem during shutdown: ${toErrorMessage(error)}`);
  } finally {
    closeDatabase();
    logger.flush?.();

    // A launcher restarts on the dedicated exit code; without one the process
    // has to start its replacement itself before leaving.
    const supervised = isSupervised();
    if (options.restart && !supervised) respawn();
    const code = options.restart && supervised ? RESTART_EXIT_CODE : 0;

    // Set it up front: once the last handle closes the process leaves on its
    // own, and an unreferenced timer would never get to choose the code.
    process.exitCode = code;
    setTimeout(() => process.exit(code), 200);
  }
}

onRestartRequested((reason) => {
  // Let the HTTP response and the Discord reply go out before tearing down.
  setTimeout(() => void shutdown(reason, { restart: true }), 400).unref();
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  log.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

main().catch((error: unknown) => {
  log.fatal(toErrorMessage(error));
  process.exitCode = 1;
  void shutdown('startup failure');
});
