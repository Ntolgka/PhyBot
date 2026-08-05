import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TtsVoice } from '@phybot/shared';
import { AppError, ExternalServiceError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('ai:tts');

/**
 * Runs an external speech engine, which is how voices beyond the built in
 * providers are added: point a voice at a program such as Piper or a cloned
 * voice runner and it becomes selectable everywhere in the bot.
 *
 * The program is executed directly, never through a shell, and the text is
 * passed as a single argument or on standard input, so nothing in it can be
 * interpreted as a command.
 */
const RUN_TIMEOUT_MS = 2 * 60 * 1000;

function buildArgs(
  voice: TtsVoice,
  text: string,
  outputPath: string,
): { args: string[]; useStdin: boolean } {
  const template = voice.commandArgs
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let useStdin = true;
  const args = template.map((argument) => {
    if (argument.includes('{text}')) {
      useStdin = false;
      return argument.replace('{text}', text);
    }
    return argument.replace('{output}', outputPath).replace('{voice}', voice.voiceId);
  });

  return { args, useStdin };
}

/** Produces an audio file with an external engine and returns its bytes. */
export async function synthesizeWithCommand(voice: TtsVoice, text: string): Promise<Buffer> {
  if (!voice.command) {
    throw new AppError(
      'voice_not_configured',
      `The voice "${voice.name}" has no program configured to run`,
      400,
    );
  }
  if (!existsSync(voice.command)) {
    throw new AppError(
      'voice_not_found',
      `The program for "${voice.name}" was not found at ${voice.command}`,
      400,
    );
  }

  const outputPath = join(tmpdir(), `phybot-tts-${randomUUID()}.wav`);
  const { args, useStdin } = buildArgs(voice, text, outputPath);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        voice.command,
        args,
        { timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (error) {
            const detail = String(stderr).split('\n').filter(Boolean).slice(-1)[0] ?? error.message;
            reject(new ExternalServiceError(voice.name, detail));
            return;
          }
          resolve();
        },
      );
      if (useStdin) child.stdin?.end(text);
    });

    if (!existsSync(outputPath)) {
      throw new ExternalServiceError(
        voice.name,
        'The program finished without writing the audio file. Check that the arguments contain {output}.',
      );
    }
    return await readFile(outputPath);
  } finally {
    await rm(outputPath, { force: true }).catch((error: unknown) => {
      log.debug({ err: error }, 'Could not remove the temporary speech file');
    });
  }
}
