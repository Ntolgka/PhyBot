import type { AiSettings, AiVoiceEvent } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { tryGetClient } from '../discord/client.js';
import * as memory from './memory.js';
import { createChatProvider } from './providers/index.js';
import { setLastError } from './status.js';
import { buildToolDefinitions, isToolName } from './tools.js';
import { executeTool, type ToolContext } from './toolExecutor.js';

const log = createLogger('ai:assistant');
const toolDefinitions = buildToolDefinitions();

export interface ChatParams {
  message: string;
  userId: string;
  userName: string;
  guildId?: string;
  channelId?: string;
  /** Receives the file paths of any images the assistant generated. */
  onGeneratedImages?: (files: string[]) => void;
}

function buildSystemPrompt(settings: AiSettings): string {
  const lines = [
    'You are the voice and text assistant for a Discord music bot. You can control music playback, generate pictures locally, report scheduled server events, or just chat.',
    'You can create images: when the user asks for a picture, a drawing or a wallpaper, call generate_image. Never claim you are unable to make images.',
    'Always pick the single most appropriate tool for the request. Use the "answer" tool for plain conversation, small talk, or when no action is needed.',
    'Never invent information about the server; only rely on what the tools report back.',
    settings.language === 'tr'
      ? 'Always reply in Turkish. Keep spoken replies short, friendly and natural - one or two sentences.'
      : 'Always reply in English. Keep replies short, friendly and natural - one or two sentences.',
  ];
  const persona = settings.persona.trim();
  if (persona) lines.push(persona);
  return lines.join('\n');
}

/** Resolves the voice channel the caller currently sits in, if any. */
function resolveVoiceChannelId(guildId: string, userId: string): string | null {
  const client = tryGetClient();
  const guild = client?.guilds.cache.get(guildId);
  return guild?.voiceStates.cache.get(userId)?.channelId ?? null;
}

function resolveUserName(guildId: string | undefined, userId: string, fallback: string): string {
  if (!guildId) return fallback;
  const client = tryGetClient();
  const member = client?.guilds.cache.get(guildId)?.members.cache.get(userId);
  return member?.displayName ?? fallback;
}

/**
 * Sends a message (typed or transcribed) to the configured LLM with the tool
 * catalogue, executes whatever it decides to do, and returns the reply text.
 * Never throws - configuration and provider failures degrade to a friendly
 * message so the rest of the bot keeps working without AI.
 */
export async function runChat(
  params: ChatParams,
  settings: AiSettings,
  textReady: boolean,
): Promise<string> {
  if (!textReady) {
    return settings.language === 'tr'
      ? 'Yapay zeka saglayicisi ayarlanmamis.'
      : 'No AI provider is configured.';
  }

  const memoryKey = params.channelId ?? params.guildId ?? params.userId;
  const history = memory.getHistory(memoryKey, settings.memoryTurns);
  const userName = resolveUserName(params.guildId, params.userId, params.userName);

  let call: { name: string; arguments: unknown };
  try {
    const provider = createChatProvider(settings);
    call = await provider.chat({
      systemPrompt: buildSystemPrompt(settings),
      history,
      message: params.message,
      tools: toolDefinitions,
      model: settings.model,
    });
    setLastError(null);
  } catch (error) {
    const detail = toErrorMessage(error);
    log.warn({ err: error }, 'AI chat request failed');
    setLastError(detail);
    return settings.language === 'tr'
      ? 'Su anda yapay zekaya ulasamiyorum, birazdan tekrar dener misin?'
      : 'I cannot reach the AI service right now, please try again shortly.';
  }

  const toolName = isToolName(call.name) ? call.name : 'answer';
  const context: ToolContext = {
    guildId: params.guildId ?? null,
    userId: params.userId,
    userName,
    voiceChannelId: params.guildId ? resolveVoiceChannelId(params.guildId, params.userId) : null,
    settings,
    ...(params.onGeneratedImages ? { onGeneratedImages: params.onGeneratedImages } : {}),
  };

  const outcome = await executeTool(toolName, call.arguments, context);
  memory.recordTurn(memoryKey, params.message, outcome.reply, settings.memoryTurns);

  if (params.guildId) {
    const event: AiVoiceEvent = {
      guildId: params.guildId,
      userId: params.userId,
      userName,
      transcript: params.message,
      reply: outcome.reply,
      action: outcome.action,
      at: Date.now(),
    };
    bus.emit('ai:voice', event);
  }

  return outcome.reply;
}
