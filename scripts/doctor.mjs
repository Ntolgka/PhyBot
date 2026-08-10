/**
 * Checks the audio pipeline end to end without needing Discord.
 *
 * "The track starts and ends within a second" can come from ffmpeg, yt-dlp, the
 * Opus encoder or the voice encryption library, and none of those announce
 * themselves clearly at runtime. This runs each stage on the real machine and
 * says which one breaks.
 *
 *   npm run doctor
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const results = [];

function report(name, ok, detail) {
  results.push({ name, ok });
  const mark = ok === true ? 'ok  ' : ok === 'warn' ? 'warn' : 'FAIL';
  console.log(`${mark}  ${name.padEnd(28)} ${detail ?? ''}`.trimEnd());
}

function run(command, args, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(error) });
      return;
    }
    const out = [];
    let err = '';
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => {
      err = `${err}${c}`.slice(-400);
    });
    child.on('error', (error) =>
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: error.message }),
    );
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

console.log(`PhyBot doctor - ${process.platform} ${process.arch}, Node ${process.version}\n`);

const [major, minor] = process.versions.node.split('.').map(Number);
report(
  'Node version',
  major > 22 || (major === 22 && minor >= 5) ? true : false,
  major > 22 || (major === 22 && minor >= 5) ? process.version : `${process.version} - needs 22.5+`,
);

// -- ffmpeg ----------------------------------------------------------------
let ffmpegPath = process.env.FFMPEG_PATH;
if (!ffmpegPath || !existsSync(ffmpegPath)) {
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    ffmpegPath = null;
  }
}

let pcm = null;
if (!ffmpegPath || !existsSync(ffmpegPath)) {
  report('ffmpeg binary', false, 'not found - run npm install, or set FFMPEG_PATH');
} else {
  const version = await run(ffmpegPath, ['-hide_banner', '-version']);
  if (version.code !== 0) {
    report('ffmpeg runs', false, version.stderr.split('\n')[0] || `exit ${version.code}`);
    console.log('      On Alpine or another musl distro the bundled build cannot run.');
    console.log('      Install ffmpeg from the package manager and set FFMPEG_PATH.');
  } else {
    report('ffmpeg runs', true, String(version.stdout).split('\n')[0].slice(0, 60));

    // Two seconds of a tone, decoded exactly the way a track is.
    const decoded = await run(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ]);
    const expected = 48000 * 2 * 2 * 2;
    if (decoded.code === 0 && decoded.stdout.length > expected * 0.9) {
      pcm = decoded.stdout;
      report('ffmpeg decodes audio', true, `${Math.round(decoded.stdout.length / 1024)} KB of PCM`);
    } else {
      report('ffmpeg decodes audio', false, decoded.stderr.split('\n')[0] || 'produced no audio');
    }
  }
}

// -- yt-dlp ----------------------------------------------------------------
let ytDlpPath = process.env.YT_DLP_PATH;
if (!ytDlpPath || !existsSync(ytDlpPath)) {
  try {
    const entry = require.resolve('youtube-dl-exec');
    const dir = entry.slice(0, entry.lastIndexOf('node_modules') + 'node_modules'.length);
    const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    ytDlpPath = `${dir}/youtube-dl-exec/bin/${name}`;
  } catch {
    ytDlpPath = null;
  }
}

if (!ytDlpPath || !existsSync(ytDlpPath)) {
  report('yt-dlp binary', false, 'not found - run npm install, or set YT_DLP_PATH');
} else {
  const version = await run(ytDlpPath, ['--version']);
  report(
    'yt-dlp runs',
    version.code === 0,
    version.code === 0 ? String(version.stdout).trim() : version.stderr.split('\n')[0],
  );
}

// -- opus ------------------------------------------------------------------
// prism-media prefers the native build; a native module compiled for a
// different Node version loads and then fails on the first frame, which ends a
// track after a fraction of a second.
let encoder = null;
for (const name of ['@discordjs/opus', 'opusscript']) {
  try {
    require.resolve(name);
  } catch {
    report(`opus: ${name}`, 'warn', 'not installed');
    continue;
  }
  try {
    const loaded = require(name);
    const Encoder = name === 'opusscript' ? loaded : loaded.OpusEncoder;
    const instance = name === 'opusscript' ? new Encoder(48000, 2) : new Encoder(48000, 2);
    // One 20 ms frame of silence is enough to prove it actually encodes.
    const frame = Buffer.alloc(48000 * 0.02 * 2 * 2);
    const encoded = instance.encode(frame, 960);
    const ok = encoded && encoded.length > 0;
    report(
      `opus: ${name}`,
      ok,
      ok ? `encodes (${encoded.length} bytes)` : 'loaded but produced nothing',
    );
    if (ok && !encoder) encoder = name;
  } catch (error) {
    report(`opus: ${name}`, false, String(error.message).split('\n')[0].slice(0, 70));
  }
}
if (!encoder) {
  console.log('      No working Opus encoder. Discord voice cannot send audio.');
  console.log(
    '      Reinstall with: npm rebuild @discordjs/opus  (or remove it to use opusscript)',
  );
}

// -- voice encryption ------------------------------------------------------
let cipher = null;
for (const name of ['sodium-native', 'libsodium-wrappers', '@noble/ciphers', 'tweetnacl']) {
  try {
    require.resolve(name);
    cipher = name;
    break;
  } catch {
    // Try the next one.
  }
}
report('voice encryption', Boolean(cipher), cipher ?? 'none found - voice packets cannot be sent');

// -- the whole chain -------------------------------------------------------
if (pcm && encoder) {
  try {
    const prism = require('prism-media');
    const enc = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });
    const frames = await new Promise((resolve, reject) => {
      let count = 0;
      enc.on('data', () => (count += 1));
      enc.on('error', reject);
      enc.on('end', () => resolve(count));
      enc.end(pcm);
    });
    report('full pipeline', frames > 50, `${frames} opus frames from 2 s of audio`);
  } catch (error) {
    report('full pipeline', false, String(error.message).split('\n')[0].slice(0, 70));
  }
}

const failed = results.filter((r) => r.ok === false);
console.log(
  failed.length === 0
    ? '\nEverything the audio pipeline needs is working.'
    : `\n${failed.length} problem(s): ${failed.map((r) => r.name).join(', ')}`,
);
process.exit(failed.length === 0 ? 0 : 1);
