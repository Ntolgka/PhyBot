import { AttachmentBuilder } from 'discord.js';
import { Cron } from 'croner';
import { truncate, type GuildSettings } from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { toErrorMessage } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { settingsRepository } from '../../db/repositories/settings.js';
import { baseEmbed } from '../../discord/embeds.js';
import { tryGetClient } from '../../discord/client.js';
import { resolveSendableChannel } from '../discordHelpers.js';
import { fetchImage, randomPost } from './client.js';

const log = createLogger('turksigara');

/**
 * One job per server, because the time and the zone are per server settings.
 * Rebuilt whenever those change rather than polled, so a new time takes effect
 * the moment it is saved.
 */
const jobs = new Map<string, Cron>();

/** Sends one already fetched picture to one server. */
async function post(settings: GuildSettings): Promise<void> {
  const client = tryGetClient();
  const channelId = settings.turksigaraChannelId;
  if (!client?.isReady() || !channelId) return;

  const channel = await resolveSendableChannel(client, channelId);
  if (!channel) {
    log.warn(
      { guildId: settings.guildId, channelId },
      'The daily turksigara channel is missing or not writable',
    );
    return;
  }

  const picture = await randomPost();
  const image = await fetchImage(picture);
  const embed = baseEmbed()
    .setAuthor({ name: 'türksigara.net', url: picture.pageUrl })
    .setTitle(`#${picture.index}`)
    .setURL(picture.pageUrl)
    .setDescription(truncate(picture.title, 300));

  // Uploaded rather than linked, because the site's own image URL redirects
  // through a host Discord's proxy will not follow.
  await channel.send(
    image
      ? {
          embeds: [embed.setImage(`attachment://${image.fileName}`)],
          files: [new AttachmentBuilder(image.data, { name: image.fileName })],
        }
      : { embeds: [embed.setImage(picture.imageUrl)] },
  );
}

/** Posts the daily picture for one server now, used by the schedule. */
export async function postDailyTurksigara(guildId: string): Promise<void> {
  const settings = settingsRepository.get(guildId);
  if (!settings.turksigaraChannelId) return;
  await post(settings);
}

/**
 * Rebuilds a server's job from its current settings. Called on every settings
 * change, so it has to be safe to run when nothing relevant moved.
 */
export function rescheduleTurksigara(settings: GuildSettings): void {
  jobs.get(settings.guildId)?.stop();
  jobs.delete(settings.guildId);
  if (!settings.turksigaraChannelId) return;

  const [hour, minute] = settings.turksigaraTime.split(':');
  const pattern = `${Number(minute)} ${Number(hour)} * * *`;

  try {
    const job = new Cron(
      pattern,
      {
        timezone: settings.turksigaraTimezone,
        // A slow run must not overlap the next day's.
        protect: true,
        catch: (error: unknown) =>
          log.error({ err: error, guildId: settings.guildId }, 'Daily turksigara post failed'),
      },
      () => {
        void postDailyTurksigara(settings.guildId).catch((error: unknown) => {
          log.error({ err: error, guildId: settings.guildId }, 'Daily turksigara post failed');
        });
      },
    );
    jobs.set(settings.guildId, job);
    log.info(
      { guildId: settings.guildId, at: job.nextRun()?.toISOString() },
      'Daily turksigara post scheduled',
    );
  } catch (error) {
    // A time or zone the scheduler rejects would otherwise take the whole
    // startup down; this server simply gets no daily post until it is fixed.
    log.warn(
      {
        guildId: settings.guildId,
        time: settings.turksigaraTime,
        zone: settings.turksigaraTimezone,
      },
      `Could not schedule the daily turksigara post: ${toErrorMessage(error)}`,
    );
  }
}

export function startTurksigaraScheduler(): void {
  for (const settings of settingsRepository.all()) rescheduleTurksigara(settings);
  bus.on('settings:update', rescheduleTurksigara);
}

export function stopTurksigaraScheduler(): void {
  bus.off('settings:update', rescheduleTurksigara);
  for (const job of jobs.values()) job.stop();
  jobs.clear();
}
