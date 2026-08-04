import { config } from '../../core/config.js';
import { ExternalServiceError } from '../../core/errors.js';
import { postJson } from './http.js';
import { toGeminiSchema } from './schema.js';
import type { ChatCall, ChatProvider, ChatRequest, SttRequest, ToolDefinition } from './types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const SERVICE = 'gemini';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

function requireApiKey(): string {
  if (!config.ai.geminiApiKey) {
    throw new ExternalServiceError(SERVICE, 'GEMINI_API_KEY tanimli degil');
  }
  return config.ai.geminiApiKey;
}

function toFunctionDeclarations(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  }));
}

async function generateContent(
  model: string,
  apiKey: string,
  body: unknown,
): Promise<GeminiResponse> {
  return postJson<GeminiResponse>({
    url: `${BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    service: SERVICE,
    headers: { 'x-goog-api-key': apiKey },
    body,
    rateLimitMessage: 'Gemini kullanim sinirina ulasildi, birazdan tekrar deneyin',
  });
}

function extractCall(response: GeminiResponse): ChatCall {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const functionPart = parts.find((part) => part.functionCall);
  if (functionPart?.functionCall) {
    return {
      name: functionPart.functionCall.name,
      arguments: functionPart.functionCall.args ?? {},
    };
  }
  const text = parts
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  return { name: 'answer', arguments: { text } };
}

export const geminiChatProvider: ChatProvider = {
  async chat(request: ChatRequest): Promise<ChatCall> {
    const apiKey = requireApiKey();
    const contents = [
      ...request.history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      { role: 'user', parts: [{ text: request.message }] },
    ];
    const body = {
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      contents,
      tools:
        request.tools.length > 0
          ? [{ functionDeclarations: toFunctionDeclarations(request.tools) }]
          : undefined,
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    };
    const response = await generateContent(request.model, apiKey, body);
    return extractCall(response);
  },
};

const TRANSCRIBE_PROMPT: Record<'tr' | 'en', string> = {
  tr: 'Bu ses kaydinda soylenenleri birebir yaz. Sadece transkripti yaz, baska hicbir sey ekleme.',
  en: 'Transcribe exactly what is said in this audio clip. Reply with only the transcript, nothing else.',
};

/** Uses the configured chat model's multimodal input to transcribe short audio clips. */
export async function transcribeWithGemini(
  request: SttRequest & { model: string },
): Promise<string> {
  const apiKey = requireApiKey();
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: request.wav.toString('base64') } },
          { text: TRANSCRIBE_PROMPT[request.language] },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 256 },
  };
  const response = await generateContent(request.model, apiKey, body);
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

export interface GeminiTtsResult {
  /** Raw little-endian PCM samples as returned by the API. */
  pcm: Buffer;
  sampleRate: number;
}

/** Synthesises speech with Gemini's audio-output mode; used as a fallback for Edge TTS. */
export async function synthesizeWithGemini(text: string, model: string): Promise<GeminiTtsResult> {
  const apiKey = requireApiKey();
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  };
  const response = await generateContent(model, apiKey, body);
  const part = response.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData);
  if (!part?.inlineData?.data) {
    throw new ExternalServiceError(SERVICE, 'Ses yaniti alinamadi');
  }
  const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType);
  return {
    pcm: Buffer.from(part.inlineData.data, 'base64'),
    sampleRate: rateMatch?.[1] ? Number(rateMatch[1]) : 24_000,
  };
}
