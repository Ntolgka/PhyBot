import { AppError } from './errors.js';

/**
 * Restarting a Node process from inside itself needs help from whatever
 * started it. Two ways are supported:
 *
 * - Launched through start.bat / start.sh: the script watches for this exit
 *   code and starts the bot again, which keeps the console window and its log
 *   output attached.
 * - Launched any other way (npm start, a terminal): the process spawns a
 *   detached copy of itself before exiting.
 */
export const RESTART_EXIT_CODE = 42;

export type RestartHandler = (reason: string) => void;

let handler: RestartHandler | null = null;
let requested = false;

/** True when a supervising launcher will bring the process back up. */
export function isSupervised(): boolean {
  return process.env.PHYBOT_SUPERVISED === '1';
}

/** Registered once by the entry point, which owns the shutdown sequence. */
export function onRestartRequested(fn: RestartHandler): void {
  handler = fn;
}

export interface RestartResult {
  /** How the process will come back: through the launcher or by respawning. */
  mode: 'supervised' | 'respawn';
  alreadyRequested: boolean;
}

/**
 * Asks the process to shut down cleanly and come back. Safe to call twice; the
 * second call is reported instead of starting another shutdown.
 */
export function requestRestart(reason: string): RestartResult {
  const mode = isSupervised() ? 'supervised' : 'respawn';
  if (!handler) {
    throw new AppError(
      'restart_unavailable',
      'The bot cannot restart itself right now. Stop and start it manually.',
      503,
    );
  }
  if (requested) return { mode, alreadyRequested: true };

  requested = true;
  handler(reason);
  return { mode, alreadyRequested: false };
}
