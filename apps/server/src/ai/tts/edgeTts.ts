import { createHash, randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import { ExternalServiceError } from '../../core/errors.js';

/**
 * Client for Microsoft Edge's "read aloud" speech endpoint. This is not a
 * published API - it is the same websocket the Edge browser and its
 * extensions use internally - so every detail here (token, headers, framing)
 * is reverse engineered and isolated behind `synthesize()` so the rest of the
 * assistant only depends on "text + voice in, MP3 bytes out".
 */
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
/**
 * The endpoint checks this against a list of Edge release trains and answers
 * with HTTP 403 during the websocket handshake once a version falls far
 * enough out of date. Both constants below must be bumped together (to a
 * recent Edge/Chromium build) if `synthesize()` starts failing with
 * "Edge TTS rejected the client version".
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0';
const SEC_MS_GEC_VERSION = '1-138.0.3351.65';
/** Milliseconds between the Windows FILETIME epoch (1601-01-01) and the Unix epoch. */
const WINDOWS_EPOCH_OFFSET_MS = 11_644_473_600_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const SERVICE = 'edge-tts';

function newHexId(): string {
  return randomUUID().replace(/-/g, '');
}

/** SHA-256 of the current 5-minute UTC window plus the client token, required by the endpoint. */
function computeSecMsGec(): string {
  const roundedMs = Math.floor(Date.now() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const windowsTicks = BigInt(roundedMs + WINDOWS_EPOCH_OFFSET_MS) * 10_000n;
  return createHash('sha256')
    .update(`${windowsTicks.toString()}${TRUSTED_CLIENT_TOKEN}`)
    .digest('hex')
    .toUpperCase();
}

function buildUrl(): string {
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    ConnectionId: newHexId(),
    'Sec-MS-GEC': computeSecMsGec(),
    'Sec-MS-GEC-Version': SEC_MS_GEC_VERSION,
  });
  return `${WSS_BASE}?${params.toString()}`;
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function speechConfigMessage(): string {
  const payload = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        },
      },
    },
  };
  return `X-Timestamp:${new Date().toUTCString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(payload)}`;
}

function ssmlMessage(requestId: string, text: string, voice: string): string {
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeSsml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toUTCString()}\r\nPath:ssml\r\n\r\n${ssml}`;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

/** Synthesises speech with a Microsoft Edge neural voice; resolves to an MP3 buffer. */
export function synthesize(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(buildUrl(), {
      headers: { Origin: ORIGIN, 'User-Agent': USER_AGENT },
      handshakeTimeout: REQUEST_TIMEOUT_MS,
    });

    const audioChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      fail(new ExternalServiceError(SERVICE, 'Zaman asimina ugradi'));
    }, REQUEST_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (audioChunks.length === 0) {
        reject(new ExternalServiceError(SERVICE, 'Ses verisi alinamadi'));
        return;
      }
      resolve(Buffer.concat(audioChunks));
    };

    socket.on('open', () => {
      socket.send(speechConfigMessage());
      socket.send(ssmlMessage(newHexId(), text, voice));
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        const buffer = toBuffer(data);
        if (buffer.length < 2) return;
        const headerLength = buffer.readUInt16BE(0);
        audioChunks.push(buffer.subarray(2 + headerLength));
        return;
      }
      if (toBuffer(data).toString().includes('Path:turn.end')) succeed();
    });

    // A non-101 handshake response (typically 403) means the endpoint
    // rejected our client identity - almost always a stale SEC_MS_GEC_VERSION
    // / User-Agent pair rather than a transient network issue.
    socket.on('unexpected-response', (_req, res) => {
      res.resume();
      if (res.statusCode === 403) {
        fail(
          new ExternalServiceError(
            SERVICE,
            'Edge TTS rejected the client version (HTTP 403); the SEC_MS_GEC_VERSION/User-Agent pair in edgeTts.ts needs to be bumped to a current Edge release',
          ),
        );
        return;
      }
      fail(new ExternalServiceError(SERVICE, `Beklenmeyen sunucu yaniti (HTTP ${res.statusCode})`));
    });

    socket.on('error', (error) => fail(new ExternalServiceError(SERVICE, error.message)));
    socket.on('close', (code) => {
      if (!settled)
        fail(new ExternalServiceError(SERVICE, `Baglanti beklenmeden kapandi (${code})`));
    });
  });
}
