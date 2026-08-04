/** Provider-agnostic shapes used by the chat and speech-to-text clients. */

export interface ToolDefinition {
  name: string;
  description: string;
  /** Standard (lowercase-typed) JSON schema describing the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  systemPrompt: string;
  /** Prior turns, oldest first. Does not include the current message. */
  history: ChatTurn[];
  message: string;
  tools: ToolDefinition[];
  model: string;
}

/** A resolved model decision: either a tool invocation or a plain reply. */
export interface ChatCall {
  name: string;
  arguments: unknown;
}

export interface ChatProvider {
  chat(request: ChatRequest): Promise<ChatCall>;
}

export interface SttRequest {
  wav: Buffer;
  language: 'tr' | 'en';
}

export interface SttProviderClient {
  transcribe(request: SttRequest): Promise<string>;
}
