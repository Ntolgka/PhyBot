import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import { ExternalServiceError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('audio');

// ffmpeg-static exports the binary path directly; its typings describe it as a
// module namespace, so the value is narrowed here once.
const bundledFfmpeg = ffmpegStatic as unknown as string | null;

/**
 * The bundled build is linked against glibc, so it cannot run at all on a musl
 * distribution such as Alpine. FFMPEG_PATH lets those machines use the system
 * package instead, matching how YT_DLP_PATH already works.
 */
function resolveFfmpeg(): string | null {
  const override = process.env.FFMPEG_PATH;
  if (override && existsSync(override)) return override;
  if (override) log.warn({ path: override }, 'FFMPEG_PATH does not exist, using the bundled build');
  return bundledFfmpeg;
}

const ffmpegPath = resolveFfmpeg();

export interface FfmpegStream {
  process: ChildProcess;
  output: Readable;
  destroy: () => void;
  /** Whatever ffmpeg last complained about, for reporting a stream that died. */
  lastError: () => string;
}

/** Serialises HTTP headers the way ffmpeg expects them on the command line. */
function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .filter(([key]) => key.toLowerCase() !== 'user-agent')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');
}

export interface StreamOptions {
  url: string;
  headers?: Record<string, string>;
  /** Start position in seconds; ffmpeg seeks the input, which is fast. */
  seekSeconds?: number;
  /** Playback speed multiplier, 1 = normal. */
  speed?: number;
}

/**
 * Decodes any source ffmpeg understands into 48 kHz stereo PCM, which is what
 * Discord voice expects. Seeking is done by restarting ffmpeg with -ss, so a
 * jump inside a track costs one fast HTTP range request instead of buffering.
 */
export function createPcmStream(options: StreamOptions): FfmpegStream {
  if (!ffmpegPath) {
    throw new ExternalServiceError('ffmpeg', 'The bundled ffmpeg binary is missing');
  }

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    // A media host that drops the connection while it is being opened used to
    // end the track instantly with "Input/output error". These two cover the
    // failure during connect and the transient 5xx, which the plain -reconnect
    // does not.
    '-reconnect_on_network_error',
    '1',
    '-reconnect_on_http_error',
    '429,500,502,503,504',
    '-reconnect_delay_max',
    '5',
    '-rw_timeout',
    '15000000',
  ];

  const headers = options.headers ?? {};
  const userAgent = headers['User-Agent'] ?? headers['user-agent'];
  if (userAgent) args.push('-user_agent', userAgent);
  const headerBlock = formatHeaders(headers);
  if (headerBlock) args.push('-headers', `${headerBlock}\r\n`);

  if (options.seekSeconds && options.seekSeconds > 0) {
    args.push('-ss', options.seekSeconds.toFixed(3));
  }

  args.push('-i', options.url, '-vn', '-sn', '-dn');

  if (options.speed && options.speed !== 1) {
    args.push('-af', `atempo=${Math.min(2, Math.max(0.5, options.speed)).toFixed(2)}`);
  }

  args.push('-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');

  const child = spawn(ffmpegPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stderrTail = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-500);
  });
  let killed = false;
  child.on('error', (error) => {
    stderrTail = `${stderrTail}\n${error.message}`.slice(-500);
    log.error({ err: error }, 'ffmpeg failed to start');
  });
  child.on('close', (code) => {
    // Warn, not debug: a decoder that dies mid-track ends the song after a
    // fraction of a second, and at the default log level this used to leave no
    // trace at all - the track simply appeared to finish.
    if (!killed && code !== 0 && code !== null) {
      log.warn({ code, stderr: stderrTail.trim() || '(no output)' }, 'ffmpeg exited early');
    }
  });

  const destroy = () => {
    if (child.exitCode === null && !child.killed) {
      killed = true;
      child.kill('SIGKILL');
    }
    child.stdout.destroy();
  };

  return { process: child, output: child.stdout, destroy, lastError: () => stderrTail.trim() };
}

/** Renders a short audio buffer (used by text-to-speech) into PCM. */
export function decodeBufferToPcm(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    return Promise.reject(
      new ExternalServiceError('ffmpeg', 'The bundled ffmpeg binary is missing'),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-300);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new ExternalServiceError('ffmpeg', stderr.trim() || `Exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}

/** Converts raw 48 kHz stereo PCM into a WAV buffer for speech recognition. */
export function pcmToWav(pcm: Buffer, sampleRate = 48000, channels = 2): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Converts 48 kHz stereo PCM to 16 kHz mono, the format speech recognition
 * actually uses. Doing it here cuts the upload to a sixth and costs no extra
 * process, which matters when every utterance in a busy channel is a request.
 */
export function downmixForSpeech(pcm48kStereo: Buffer): Buffer {
  const frames = Math.floor(pcm48kStereo.length / 4);
  const outFrames = Math.floor(frames / 3);
  const out = Buffer.alloc(outFrames * 2);

  for (let i = 0; i < outFrames; i += 1) {
    // Average the three source frames that make up one output frame, and the
    // two channels within each, which doubles as a cheap low pass filter.
    let sum = 0;
    for (let step = 0; step < 3; step += 1) {
      const offset = (i * 3 + step) * 4;
      sum += pcm48kStereo.readInt16LE(offset) + pcm48kStereo.readInt16LE(offset + 2);
    }
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / 6))), i * 2);
  }
  return out;
}
