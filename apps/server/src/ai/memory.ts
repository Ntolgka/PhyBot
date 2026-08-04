import type { ChatTurn } from './providers/index.js';

/**
 * Short rolling conversation history, kept in process memory only (never
 * persisted) and scoped per Discord channel so unrelated conversations do not
 * bleed into each other.
 */
const conversations = new Map<string, ChatTurn[]>();

/** Returns up to `maxTurns` prior user/assistant exchanges, oldest first. */
export function getHistory(key: string, maxTurns: number): ChatTurn[] {
  if (maxTurns <= 0) return [];
  const turns = conversations.get(key);
  if (!turns) return [];
  return turns.slice(-maxTurns * 2);
}

/** Appends one exchange and trims the buffer to the configured length. */
export function recordTurn(
  key: string,
  userMessage: string,
  assistantReply: string,
  maxTurns: number,
): void {
  if (maxTurns <= 0) {
    conversations.delete(key);
    return;
  }
  const turns = conversations.get(key) ?? [];
  turns.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantReply },
  );
  conversations.set(key, turns.slice(-maxTurns * 2));
}

export function clearHistory(key?: string): void {
  if (key) conversations.delete(key);
  else conversations.clear();
}
