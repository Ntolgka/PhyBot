/**
 * Downloads everything the image generator needs into this folder:
 *
 *   Flux/bin      the stable-diffusion.cpp runtime
 *   Flux/models   the FLUX.1-schnell weights, text encoders, VAE and upscaler
 *
 * Run it from the project root with:  npm run flux:setup
 *
 * Downloads resume, so a failed or interrupted run can simply be repeated.
 * Nothing here is imported by the bot; it is a one time setup helper.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const fluxDir = dirname(fileURLToPath(import.meta.url));
const binDir = join(fluxDir, 'bin');
const modelsDir = join(fluxDir, 'models');
const imagesDir = join(fluxDir, 'Images');
const tempDir = join(fluxDir, '.download');

const SD_RELEASE = 'master-812-ea7f0c8';
const SD_BUILD = 'sd-master-ea7f0c8';

/** Runtime archives, chosen by the backend argument. */
const RUNTIMES = {
  cuda: [
    {
      name: `${SD_BUILD}-bin-win-cuda12-x64.zip`,
      url: `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_RELEASE}/${SD_BUILD}-bin-win-cuda12-x64.zip`,
      target: binDir,
      note: 'CUDA runtime for NVIDIA cards',
    },
    {
      name: 'cudart-sd-bin-win-cu12-x64.zip',
      url: `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_RELEASE}/cudart-sd-bin-win-cu12-x64.zip`,
      target: binDir,
      note: 'CUDA support libraries',
    },
  ],
  vulkan: [
    {
      name: `${SD_BUILD}-bin-win-vulkan-x64.zip`,
      url: `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_RELEASE}/${SD_BUILD}-bin-win-vulkan-x64.zip`,
      target: binDir,
      note: 'Vulkan runtime, works on most GPUs',
    },
  ],
  cpu: [
    {
      name: `${SD_BUILD}-bin-win-cpu-x64.zip`,
      url: `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_RELEASE}/${SD_BUILD}-bin-win-cpu-x64.zip`,
      target: binDir,
      note: 'CPU only runtime, very slow',
    },
  ],
};

/**
 * FLUX.2-klein-4B is the default: Apache licensed, four steps, and about 5 GB
 * of weights in total, which fits an 8 GB card without offloading. It reads
 * the prompt with Qwen3 instead of the CLIP and T5 pair FLUX.1 used.
 */
const MODELS = [
  {
    name: 'flux-2-klein-4b-Q4_0.gguf',
    url: 'https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q4_0.gguf',
    approxMb: 2460,
    note: 'FLUX.2-klein-4B diffusion model',
  },
  {
    name: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    approxMb: 2500,
    note: 'Qwen3 text encoder',
  },
  {
    name: 'flux2-vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux2-klein-4B/resolve/main/split_files/vae/flux2-vae.safetensors',
    approxMb: 340,
    note: 'VAE decoder',
  },
  // Three upscalers, because the best one depends on the picture. They are all
  // ESRGAN, the only family the binary can load, and each was checked against
  // it: some popular weights (4x_foolhardy_Remacri) load without an error but
  // return a blurred image, so they are deliberately not offered here.
  {
    name: 'RealESRGAN_x4plus.pth',
    url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth',
    approxMb: 64,
    note: 'upscaler, most detail on photos',
    optional: true,
  },
  {
    name: '4x-UltraSharp.pth',
    url: 'https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x-UltraSharp.pth',
    approxMb: 64,
    note: 'upscaler, clean edges',
    optional: true,
  },
  {
    name: 'RealESRGAN_x4plus_anime_6B.pth',
    url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth',
    approxMb: 18,
    note: 'upscaler, anime and flat art, fastest',
    optional: true,
  },
];
function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function progressBar(received, total) {
  if (!total) return formatMb(received);
  const ratio = Math.min(1, received / total);
  const filled = Math.round(ratio * 24);
  return `[${'#'.repeat(filled)}${'.'.repeat(24 - filled)}] ${(ratio * 100).toFixed(1)}% of ${formatMb(total)}`;
}

/** Downloads to a .part file and resumes when one is already there. */
async function download(url, destination, label) {
  if (existsSync(destination)) {
    console.log(`  ${label}: already present`);
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  const existing = existsSync(partial) ? statSync(partial).size : 0;

  const headers = { 'User-Agent': 'PhyBot-setup' };
  if (existing > 0) headers.Range = `bytes=${existing}-`;

  const response = await fetch(url, { headers, redirect: 'follow' });
  if (response.status === 416) {
    // The range request says the file is already complete.
    renameSync(partial, destination);
    console.log(`  ${label}: done`);
    return;
  }
  if (!response.ok) {
    throw new Error(`${label}: download failed with HTTP ${response.status}`);
  }
  if (!response.body) throw new Error(`${label}: empty response`);

  const resumed = response.status === 206 && existing > 0;
  const total = Number(response.headers.get('content-length') ?? 0) + (resumed ? existing : 0);
  let received = resumed ? existing : 0;
  let lastPrint = 0;

  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    received += chunk.length;
    if (Date.now() - lastPrint < 500) return;
    lastPrint = Date.now();
    process.stdout.write(`\r  ${label}: ${progressBar(received, total)}   `);
  });

  await pipeline(source, createWriteStream(partial, { flags: resumed ? 'a' : 'w' }));
  process.stdout.write(`\r  ${label}: ${progressBar(received, total)}   \n`);
  renameSync(partial, destination);
}

async function unzip(archive, target) {
  mkdirSync(target, { recursive: true });
  await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${archive}' -DestinationPath '${target}' -Force`,
    ],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
}

async function main() {
  const backend = (process.argv[2] ?? 'cuda').toLowerCase();
  if (!RUNTIMES[backend]) {
    console.error(`Unknown backend "${backend}". Use one of: cuda, vulkan, cpu`);
    process.exit(1);
  }
  if (process.platform !== 'win32') {
    console.error(
      'This setup script downloads the Windows builds. On macOS or Linux, download the matching\n' +
        'stable-diffusion.cpp release into Flux/bin yourself, then rerun to fetch the models.',
    );
  }

  for (const dir of [binDir, modelsDir, imagesDir, tempDir]) mkdirSync(dir, { recursive: true });

  const totalMb = MODELS.reduce((sum, model) => sum + model.approxMb, 0);
  console.log('PhyBot image generator setup');
  console.log(`  backend : ${backend}`);
  console.log(`  folder  : ${fluxDir}`);
  console.log(`  download: roughly ${(totalMb / 1024).toFixed(1)} GB of models plus the runtime`);
  console.log('  Interrupted downloads resume when you run this again.\n');

  console.log('Runtime');
  for (const runtime of RUNTIMES[backend]) {
    const archive = join(tempDir, runtime.name);
    await download(runtime.url, archive, runtime.note);
    await unzip(archive, runtime.target);
  }

  console.log('\nModels');
  for (const model of MODELS) {
    try {
      await download(model.url, join(modelsDir, model.name), `${model.note} (${model.name})`);
    } catch (error) {
      if (model.optional) {
        console.warn(`  ${model.note}: skipped (${error.message})`);
        continue;
      }
      throw error;
    }
  }

  await rm(tempDir, { recursive: true, force: true });

  const binary = join(binDir, 'sd-cli.exe');
  console.log('\nSetup finished.');
  console.log(`  runtime : ${existsSync(binary) ? 'ready' : 'MISSING, check the messages above'}`);
  console.log('  Start the bot and open the dashboard Images page to generate something.');

  // Keep the configured file names in step with what was downloaded.
  const configFile = join(fluxDir, 'flux.config.json');
  if (!existsSync(configFile)) {
    const example = join(fluxDir, 'flux.config.example.json');
    if (existsSync(example)) {
      const contents = JSON.parse(await readFile(example, 'utf8'));
      contents.backend = backend;
      await import('node:fs').then(({ writeFileSync }) =>
        writeFileSync(configFile, `${JSON.stringify(contents, null, 2)}\n`),
      );
      console.log('  config  : created Flux/flux.config.json');
    }
  }
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  console.error('Run the command again to resume the download.');
  process.exit(1);
});
