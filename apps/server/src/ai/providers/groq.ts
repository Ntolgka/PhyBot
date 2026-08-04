import { config } from '../../core/config.js';
import { ExternalServiceError } from '../../core/errors.js';
import { postForm, postJson } from './http.js';
import type { ChatCall, ChatProvider, ChatRequest, SttRequest, ToolDefinition } from './types.js';

const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const SERVICE = 'groq';

interface GroqChatResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
}

interface GroqTranscriptionResponse {
  text?: string;
}

function requireApiKey(): string {
  if (!config.ai.groqApiKey) {
    throw new ExternalServiceError(SERVICE, 'GROQ_API_KEY tanimli degil');
  }
  return config.ai.groqApiKey;
}

function toOpenAiTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export const groqChatProvider: ChatProvider = {
  async chat(request: ChatRequest): Promise<ChatCall> {
    const apiKey = requireApiKey();
    const messages = [
      { role: 'system', content: request.systemPrompt },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: request.message },
    ];
    const body = {
      model: request.model,
      messages,
      tools: request.tools.length > 0 ? toOpenAiTools(request.tools) : undefined,
      tool_choice: request.tools.length > 0 ? 'auto' : undefined,
      temperature: 0.4,
      max_tokens: 512,
    };
    const response = await postJson<GroqChatResponse>({
      url: CHAT_URL,
      service: SERVICE,
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      rateLimitMessage: 'Groq kullanim sinirina ulasildi, birazdan tekrar deneyin',
    });

    const message = response.choices?.[0]?.message;
    const call = message?.tool_calls?.[0];
    if (call) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments) as unknown;
      } catch {
        args = {};
      }
      return { name: call.function.name, arguments: args };
    }
    return { name: 'answer', arguments: { text: (message?.content ?? '').trim() } };
  },
};

/** Transcribes audio via Groq's Whisper-compatible endpoint. */
export async function transcribeWithGroq(request: SttRequest & { model: string }): Promise<string> {
  const apiKey = requireApiKey();
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(request.wav)], { type: 'audio/wav' }), 'audio.wav');
  form.set('model', request.model);
  form.set('language', request.language);
  form.set('response_format', 'json');

  const response = await postForm<GroqTranscriptionResponse>({
    url: TRANSCRIPTIONS_URL,
    service: SERVICE,
    headers: { Authorization: `Bearer ${apiKey}` },
    form,
    rateLimitMessage: 'Groq kullanim sinirina ulasildi, birazdan tekrar deneyin',
  });
  return (response.text ?? '').trim();
}
