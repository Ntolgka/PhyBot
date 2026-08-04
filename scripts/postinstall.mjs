/**
 * First-run setup:
 *  - creates .env from .env.example so a fresh clone only needs a bot token
 *  - creates the data directory
 *  - makes sure the bundled ffmpeg / yt-dlp binaries are present
 *
 * npm 11 blocks dependency install scripts by default, which would leave the
 * ffmpeg-static and youtube-dl-exec binaries missing. Running their installers
 * from here keeps `npm install` a single step for the user.
 */
import { access, copyFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(script, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: 'inherit' });
    child.on('error', () => resolvePromise(false));
    child.on('close', (code) => resolvePromise(code === 0));
  });
}

async function ensureBinary({ label, binary, installer, packageDir }) {
  if (await exists(binary)) return;
  if (!(await exists(installer))) return;
  console.log(`[phybot] Downloading ${label}...`);
  const ok = await run(installer, packageDir);
  if (!ok || !(await exists(binary))) {
    console.warn(
      `[phybot] Could not download ${label} automatically. Run "node ${installer}" manually once you have network access.`,
    );
  }
}

const envPath = resolve(rootDir, '.env');
const examplePath = resolve(rootDir, '.env.example');
if (process.env.CI !== 'true' && !(await exists(envPath)) && (await exists(examplePath))) {
  await copyFile(examplePath, envPath);
  console.log('[phybot] Created .env from .env.example - fill in DISCORD_TOKEN before starting.');
}

await mkdir(resolve(rootDir, 'data'), { recursive: true });

const ffmpegDir = resolve(rootDir, 'node_modules/ffmpeg-static');
await ensureBinary({
  label: 'ffmpeg',
  binary: resolve(ffmpegDir, isWindows ? 'ffmpeg.exe' : 'ffmpeg'),
  installer: resolve(ffmpegDir, 'install.js'),
  packageDir: ffmpegDir,
});

const ytDlpDir = resolve(rootDir, 'node_modules/youtube-dl-exec');
await ensureBinary({
  label: 'yt-dlp',
  binary: resolve(ytDlpDir, isWindows ? 'bin/yt-dlp.exe' : 'bin/yt-dlp'),
  installer: resolve(ytDlpDir, 'scripts/postinstall.js'),
  packageDir: ytDlpDir,
});
