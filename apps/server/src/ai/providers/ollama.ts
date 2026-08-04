import { config } from '../../core/config.js';
import { postJson } from './http.js';
import type { ChatCall, ChatProvider, ChatRequest, ToolDefinition } from './types.js';

const SERVICE = 'ollama';

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: { function: { name: string; arguments: unknown } }[];
  };
}

function toOllamaTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export const ollamaChatProvider: ChatProvider = {
  async chat(request: ChatRequest): Promise<ChatCall> {
    const messages = [
      { role: 'system', content: request.systemPrompt },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: request.message },
    ];
    const body = {
      model: request.model,
      messages,
      tools: request.tools.length > 0 ? toOllamaTools(request.tools) : undefined,
      stream: false,
    };
    const response = await postJson<OllamaChatResponse>({
      url: `${config.ai.ollamaHost.replace(/\/$/, '')}/api/chat`,
      service: SERVICE,
      body,
      timeoutMs: 30_000,
    });

    const call = response.message?.tool_calls?.[0];
    if (call) {
      const args =
        typeof call.function.arguments === 'string'
          ? safeParse(call.function.arguments)
          : (call.function.arguments ?? {});
      return { name: call.function.name, arguments: args };
    }
    return { name: 'answer', arguments: { text: (response.message?.content ?? '').trim() } };
  },
};

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}
