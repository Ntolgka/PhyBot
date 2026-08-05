import type { AiSettings } from '@phybot/shared';
import { formatDuration, truncate } from '@phybot/shared';
import { AppError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { eventsRepository } from '../db/repositories/events.js';
import { generateImages, getFluxStatus, imageFilePath } from '../flux/index.js';
import { leave, play, getPlayer } from '../music/service.js';
import { toolSchemas, type ToolName } from './tools.js';

const log = createLogger('ai:tools');

export interface ToolContext {
  guildId: string | null;
  userId: string;
  userName: string;
  /** Voice channel the caller is currently in, when known. */
  voiceChannelId: string | null;
  settings: AiSettings;
  /** Called with the file paths of any images a tool produced. */
  onGeneratedImages?: (files: string[]) => void;
}

export interface ToolOutcome {
  reply: string;
  /** Tool name that was executed, or null for a plain conversational reply. */
  action: string | null;
}

function t(language: AiSettings['language'], tr: string, en: string): string {
  return language === 'tr' ? tr : en;
}

/** Renders images and hands the file paths to whoever asked, if anyone. */
async function runImageTool(
  args: { prompt: string; count?: number },
  ctx: ToolContext,
): Promise<string> {
  const status = getFluxStatus();
  if (!status.installed || !status.modelsReady) {
    return t(
      ctx.settings.language,
      'Goruntu uretici henuz kurulu degil.',
      'The image generator is not set up yet.',
    );
  }

  const count = args.count ?? 1;
  try {
    const result = await generateImages({ prompt: args.prompt, count, requestedBy: ctx.userId });
    ctx.onGeneratedImages?.(result.images.map((image) => imageFilePath(image)));
    return t(
      ctx.settings.language,
      count > 1 ? `${count} gorsel hazir.` : 'Gorsel hazir.',
      count > 1 ? `Here are ${count} images.` : 'Here is the image.',
    );
  } catch (error) {
    log.warn({ err: error }, 'Image generation from the assistant failed');
    return error instanceof Error && error.message
      ? error.message
      : t(ctx.settings.language, 'Gorsel olusturulamadi.', 'The image could not be generated.');
  }
}

/** Validates and runs a resolved tool call, returning a user-facing reply. */
export async function executeTool(
  name: ToolName,
  args: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (name === 'answer') {
    const parsed = toolSchemas.answer.safeParse(args);
    return {
      reply: parsed.success
        ? parsed.data.text
        : t(
            ctx.settings.language,
            'Anlayamadim, tekrar eder misin?',
            "I didn't quite catch that, could you repeat it?",
          ),
      action: null,
    };
  }

  // Drawing does not involve a server at all, so it works from the dashboard
  // chat as well. Everything below this point acts on a guild's player.
  if (name === 'generate_image') {
    const parsed = toolSchemas.generate_image.safeParse(args ?? {});
    if (!parsed.success) {
      return {
        reply: t(
          ctx.settings.language,
          'Ne cizecegimi anlayamadim.',
          "I couldn't tell what to draw.",
        ),
        action: name,
      };
    }
    return { reply: await runImageTool(parsed.data, ctx), action: name };
  }

  if (!ctx.guildId) {
    return {
      reply: t(
        ctx.settings.language,
        'Bu komut yalnizca bir sunucuda calisir.',
        'This command only works inside a server.',
      ),
      action: name,
    };
  }
  const guildId = ctx.guildId;

  const schema = toolSchemas[name];
  const parsedArgs = schema.safeParse(args ?? {});
  if (!parsedArgs.success) {
    return {
      reply: t(ctx.settings.language, 'Komutu anlayamadim.', "I couldn't understand that command."),
      action: name,
    };
  }

  try {
    const reply = await runTool(name, parsedArgs.data as Record<string, unknown>, guildId, ctx);
    return { reply, action: name };
  } catch (error) {
    // AppError and the plain Error thrown by the player controls already carry
    // a human-readable message ("Nothing is playing", "Join a voice channel
    // first", ...); anything else is logged and replaced with a generic reply.
    if (error instanceof AppError || (error instanceof Error && error.message)) {
      return { reply: error.message, action: name };
    }
    log.warn({ err: error, guildId }, 'Tool execution failed');
    return {
      reply: t(
        ctx.settings.language,
        'Bir seyler ters gitti, tekrar dener misin?',
        'Something went wrong, please try again.',
      ),
      action: name,
    };
  }
}

async function runTool(
  // 'answer' and 'generate_image' are handled before this point because they
  // do not act on a guild's player.
  name: Exclude<ToolName, 'answer' | 'generate_image'>,
  args: Record<string, unknown>,
  guildId: string,
  ctx: ToolContext,
): Promise<string> {
  const lang = ctx.settings.language;

  switch (name) {
    case 'play_music': {
      const result = await play({
        guildId,
        query: args.query as string,
        requester: { id: ctx.userId, name: ctx.userName },
        voiceChannelId: ctx.voiceChannelId ?? undefined,
        next: args.next as boolean | undefined,
        shuffle: args.shuffle as boolean | undefined,
      });
      if (result.added === 0) {
        return t(lang, 'Uygun bir sonuc bulamadim.', "I couldn't find anything to play.");
      }
      const first = result.tracks[0];
      const label = result.playlistName
        ? `"${result.playlistName}" (${result.added} ${t(lang, 'parca', 'tracks')})`
        : first
          ? `"${truncate(first.title, 80)}"`
          : t(lang, 'istek', 'the request');
      return result.startedNow
        ? t(lang, `${label} calmaya basladi.`, `Now playing ${label}.`)
        : t(lang, `${label} siraya eklendi.`, `${label} was added to the queue.`);
    }

    case 'pause': {
      const player = getPlayer(guildId);
      return player.pause()
        ? t(lang, 'Duraklatildi.', 'Paused.')
        : t(lang, 'Su anda calan bir sey yok.', 'Nothing is currently playing.');
    }

    case 'resume': {
      const player = getPlayer(guildId);
      return player.resume()
        ? t(lang, 'Devam ediyor.', 'Resumed.')
        : t(lang, 'Devam ettirilecek bir sey yok.', 'Nothing to resume.');
    }

    case 'skip': {
      const player = getPlayer(guildId);
      const count = (args.count as number | undefined) ?? 1;
      const next = await player.skip(count);
      return next
        ? t(
            lang,
            `Atlandi. Simdi calan: "${truncate(next.title, 80)}".`,
            `Skipped. Now playing "${truncate(next.title, 80)}".`,
          )
        : t(lang, 'Atlandi. Sira artik bos.', 'Skipped. The queue is now empty.');
    }

    case 'previous': {
      const player = getPlayer(guildId);
      const previous = await player.previous();
      return previous
        ? t(
            lang,
            `Onceki parcaya donuldu: "${truncate(previous.title, 80)}".`,
            `Back to "${truncate(previous.title, 80)}".`,
          )
        : t(lang, 'Onceki bir parca yok.', 'There is no previous track.');
    }

    case 'restart_track': {
      const player = getPlayer(guildId);
      const current = await player.restart();
      return current
        ? t(lang, 'Parca basa alindi.', 'Track restarted from the beginning.')
        : t(lang, 'Su anda calan bir sey yok.', 'Nothing is currently playing.');
    }

    case 'stop': {
      const player = getPlayer(guildId);
      player.stop();
      return t(lang, 'Durduruldu ve sira temizlendi.', 'Stopped and cleared the queue.');
    }

    case 'seek': {
      const player = getPlayer(guildId);
      const seconds = await player.seek(args.seconds as number);
      return t(
        lang,
        `${formatDuration(seconds)} konumuna atlandi.`,
        `Jumped to ${formatDuration(seconds)}.`,
      );
    }

    case 'seek_relative': {
      const player = getPlayer(guildId);
      const seconds = await player.seekRelative(args.delta as number);
      return t(
        lang,
        `${formatDuration(seconds)} konumuna atlandi.`,
        `Jumped to ${formatDuration(seconds)}.`,
      );
    }

    case 'set_volume': {
      const player = getPlayer(guildId);
      const percent = player.setVolume(args.percent as number);
      return t(lang, `Ses seviyesi %${percent} olarak ayarlandi.`, `Volume set to ${percent}%.`);
    }

    case 'set_loop': {
      const player = getPlayer(guildId);
      const mode = player.setLoop(args.mode as 'off' | 'track' | 'queue');
      const label = t(
        lang,
        mode === 'off' ? 'kapali' : mode === 'track' ? 'tek parca' : 'tum sira',
        mode,
      );
      return t(lang, `Tekrar modu: ${label}.`, `Loop mode set to ${label}.`);
    }

    case 'shuffle_queue': {
      const player = getPlayer(guildId);
      const count = player.shuffleQueue();
      return t(
        lang,
        `Sira karistirildi (${count} parca).`,
        `Shuffled the queue (${count} tracks).`,
      );
    }

    case 'toggle_autoplay': {
      const player = getPlayer(guildId);
      const enabled = player.setAutoplay(args.enabled as boolean);
      return enabled
        ? t(lang, 'Otomatik cal acildi.', 'Autoplay enabled.')
        : t(lang, 'Otomatik cal kapatildi.', 'Autoplay disabled.');
    }

    case 'queue_info': {
      const player = getPlayer(guildId);
      const snapshot = player.snapshot();
      if (snapshot.queue.length === 0) {
        return t(lang, 'Sirada baska parca yok.', 'The queue is empty.');
      }
      const upcoming = snapshot.queue
        .slice(0, 5)
        .map((track, index) => `${index + 1}. ${truncate(track.title, 60)}`)
        .join(', ');
      const remainder =
        snapshot.queue.length > 5
          ? t(
              lang,
              ` ve ${snapshot.queue.length - 5} parca daha`,
              ` and ${snapshot.queue.length - 5} more`,
            )
          : '';
      return t(lang, `Sirada: ${upcoming}${remainder}.`, `Up next: ${upcoming}${remainder}.`);
    }

    case 'now_playing': {
      const player = getPlayer(guildId);
      const snapshot = player.snapshot();
      if (!snapshot.current) {
        return t(lang, 'Su anda calan bir sey yok.', 'Nothing is currently playing.');
      }
      const position = formatDuration(snapshot.position, snapshot.current.isLive);
      const duration = formatDuration(snapshot.current.duration, snapshot.current.isLive);
      return t(
        lang,
        `Simdi calan: "${truncate(snapshot.current.title, 80)}" (${position} / ${duration}).`,
        `Now playing "${truncate(snapshot.current.title, 80)}" (${position} / ${duration}).`,
      );
    }

    case 'leave_voice': {
      const left = leave(guildId);
      return left
        ? t(lang, 'Ses kanalindan ayrildim.', 'Left the voice channel.')
        : t(lang, 'Zaten bir ses kanalinda degilim.', "I'm not in a voice channel.");
    }

    case 'list_events': {
      const events = eventsRepository.list(guildId).slice(0, 5);
      if (events.length === 0) {
        return t(lang, 'Yaklasan bir etkinlik yok.', 'There are no upcoming events.');
      }
      const list = events
        .map((event) => `${truncate(event.title, 60)} (${formatEventDate(event.startsAt, lang)})`)
        .join(', ');
      return t(lang, `Yaklasan etkinlikler: ${list}.`, `Upcoming events: ${list}.`);
    }

    default: {
      const _exhaustive: never = name;
      throw new Error(`Unhandled tool: ${String(_exhaustive)}`);
    }
  }
}

function formatEventDate(startsAt: number, lang: AiSettings['language']): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startsAt));
}
