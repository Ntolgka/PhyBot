import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';
import pretty from 'pino-pretty';
import { LOG_BUFFER_SIZE, type LogEntry } from '@phybot/shared';
import { config } from './config.js';

const LEVEL_NAMES: Record<number, LogEntry['level']> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

class LogBuffer extends EventEmitter {
  private readonly entries: LogEntry[] = [];
  private nextId = 1;

  push(entry: Omit<LogEntry, 'id'>): void {
    const record: LogEntry = { ...entry, id: this.nextId++ };
    this.entries.push(record);
    if (this.entries.length > LOG_BUFFER_SIZE) this.entries.shift();
    this.emit('entry', record);
  }

  /** Returns the most recent entries, oldest first. */
  recent(limit = LOG_BUFFER_SIZE): LogEntry[] {
    return this.entries.slice(-Math.max(1, limit));
  }
}

/** In-memory log tail exposed through the dashboard console. */
export const logBuffer = new LogBuffer();

/** Captures every log line so the dashboard can show it without file access. */
const memoryStream = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const record = JSON.parse(String(chunk)) as {
        level: number;
        time: number;
        msg?: string;
        scope?: string;
        err?: { message?: string };
      };
      const message = record.msg ?? record.err?.message ?? '';
      logBuffer.push({
        level: LEVEL_NAMES[record.level] ?? 'info',
        message,
        scope: record.scope ?? 'app',
        at: record.time ?? Date.now(),
      });
    } catch {
      // A malformed line must never take the process down.
    }
    callback();
  },
});

const consoleStream = config.isProduction
  ? process.stdout
  : pretty({
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{scope} | {msg}',
    });

export const logger: Logger = pino(
  {
    level: config.logLevel,
    base: undefined,
    redact: {
      paths: ['token', 'password', 'apiKey', '*.token', '*.password', '*.apiKey', 'authorization'],
      censor: '[redacted]',
    },
  },
  pino.multistream([
    { stream: consoleStream, level: config.logLevel },
    { stream: memoryStream, level: config.logLevel },
  ]),
);

/** Creates a namespaced child logger, e.g. createLogger('music'). */
export function createLogger(scope: string): Logger {
  return logger.child({ scope });
}
