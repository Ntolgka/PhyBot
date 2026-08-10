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

// Without this the script reports on a different ffmpeg than the bot uses, and
// FFMPEG_PATH is exactly the setting people reach for when playback is broken.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env yet, which is fine before the first run.
}

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

// -- ffmpeg over https -----------------------------------------------------
// Decoding a local tone proves ffmpeg can decode, not that it can fetch, and
// fetching is the stage that fails when a track ends before it starts. ffmpeg
// reports every one of those failures as a bare "Input/output error", so the
// two causes are separated here: TLS that does not work at all, and a media
// host that refuses this particular request.
const online = !process.argv.includes('--offline');
if (ffmpegPath && online) {
  // Any https host will do. The response is not media, so reaching the point of
  // complaining about the *content* means the connection itself succeeded.
  const tls = await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-i', 'https://www.google.com/generate_204', '-f', 'null', '-',
  ]);
  const reached = /invalid data|end of file|empty|does not contain/i.test(tls.stderr);
  if (tls.code === 0 || reached) {
    report('ffmpeg https works', true, 'connected');
  } else {
    report('ffmpeg https works', false, tls.stderr.split('\n').filter(Boolean).pop() ?? '');
    console.log('      ffmpeg cannot open any https URL, so no track can ever be fetched.');
    console.log('      Use the ffmpeg your distribution builds instead:');
    console.log('        sudo apt install -y ffmpeg');
    console.log('        echo "FFMPEG_PATH=$(command -v ffmpeg)" >> .env');
  }
}

if (ffmpegPath && ytDlpPath && existsSync(ytDlpPath) && online) {
  // A media URL is signed for the client that asked for it, so the request has
  // to carry the same user agent yt-dlp used. Fetching without it answers a
  // different question than the one being asked.
  const probe = await run(ytDlpPath, [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '--no-color', '--ignore-config', '--no-warnings', '--skip-download',
    '-f', 'bestaudio', '--print', 'urls', '--print', '%(http_headers.User-Agent)s',
  ]);
  const [mediaUrl = '', userAgent = ''] = String(probe.stdout).trim().split('\n');

  if (probe.code !== 0 || !mediaUrl.startsWith('http')) {
    report('yt-dlp resolves a track', false, probe.stderr.split('\n').filter(Boolean).pop() ?? '');
  } else {
    const client = /[?&]c=([A-Z_]+)/.exec(mediaUrl)?.[1];
    report('yt-dlp resolves a track', true, client ? `client ${client}` : 'got a media URL');

    const args = ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_on_network_error', '1'];
    if (userAgent && userAgent !== 'NA') args.push('-user_agent', userAgent);
    const fetched = await run(ffmpegPath, [
      ...args, '-i', mediaUrl, '-t', '1', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
    ]);
    if (fetched.code === 0 && fetched.stdout.length > 48000) {
      report('ffmpeg fetches a track', true, `${Math.round(fetched.stdout.length / 1024)} KB read`);
    } else {
      report('ffmpeg fetches a track', false, fetched.stderr.split('\n').filter(Boolean).pop() ?? '');
      console.log('      https works but this host refused the request. Report the line above,');
      console.log('      and try the ffmpeg your distribution builds:');
      console.log('        sudo apt install -y ffmpeg');
      console.log('        echo "FFMPEG_PATH=$(command -v ffmpeg)" >> .env');
    }
  }
}

// -- the real player path --------------------------------------------------
// The checks above build their own ffmpeg command, which is exactly how the
// first version of this script passed on a machine where playback still failed:
// a simplified command answers a simplified question. This one runs the
// player's own code, so nothing can drift between what is tested and what runs.
const distDir = new URL('../apps/server/dist/music/', import.meta.url);
if (online && existsSync(new URL('audioStream.js', distDir))) {
  try {
    const { fetchPlaybackInfo } = await import(new URL('ytdlp.js', distDir).href);
    const { createPcmStream } = await import(new URL('audioStream.js', distDir).href);
    const info = await fetchPlaybackInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const stream = createPcmStream({ url: info.streamUrl, headers: info.headers });

    const bytes = await new Promise((resolve) => {
      let total = 0;
      const stop = setTimeout(() => {
        stream.destroy();
        resolve(total);
      }, 10_000);
      stream.output.on('data', (chunk) => {
        total += chunk.length;
        // A second of PCM is plenty to prove the stream really opened.
        if (total > 48000 * 2 * 2) {
          clearTimeout(stop);
          stream.destroy();
          resolve(total);
        }
      });
      stream.output.on('close', () => {
        clearTimeout(stop);
        resolve(total);
      });
    });

    const ok = bytes > 48000;
    report('player fetches a track', ok, ok ? `${Math.round(bytes / 1024)} KB of PCM` : stream.lastError() || 'no audio');
    if (!ok) {
      const names = Object.keys(info.headers ?? {});
      console.log(`      The plain fetch above worked, so the difference is in what the player`);
      console.log(`      adds. Headers sent: ${names.join(', ') || '(none)'}`);
    }
  } catch (error) {
    // Missing .env, an unbuilt dist or a resolver failure - none of which is the
    // audio pipeline itself, so it is reported rather than treated as a failure.
    report('player fetches a track', 'warn', String(error.message).split('\n')[0].slice(0, 80));
  }
}

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
