import { Cron } from 'croner';
import { MessageFlags, type ButtonInteraction, type Client } from 'discord.js';
import type { EventInput, GuildEvent, RsvpStatus } from '@phybot/shared';
import { RSVP_STATUSES, truncate } from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { config } from '../../core/config.js';
import { AppError, NotFoundError, toErrorMessage } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { eventsRepository } from '../../db/repositories/events.js';
import { tryGetClient } from '../../discord/client.js';
import { resolveSendableChannel } from '../discordHelpers.js';
import { eventComponents, eventEmbed } from './embeds.js';
import { wouldExceedCapacity } from './logic.js';

const log = createLogger('events');

const RSVP_STATUS_SET = new Set<string>(RSVP_STATUSES);
const REMINDER_MENTION_LIMIT = 40;

export function listEvents(guildId?: string, includePast = false): GuildEvent[] {
  return eventsRepository.list(guildId, includePast);
}

export function getEvent(id: number): GuildEvent {
  const event = eventsRepository.getById(id);
  if (!event) throw new NotFoundError('That event no longer exists');
  return event;
}

function emitUpdate(event: GuildEvent): GuildEvent {
  bus.emit('event:update', event);
  return event;
}

function validateWindow(startsAt: number, endsAt: number | null): void {
  if (startsAt <= Date.now()) {
    throw new AppError('invalid_start_time', 'The event must start in the future', 400);
  }
  if (endsAt != null && endsAt <= startsAt) {
    throw new AppError('invalid_end_time', 'The end time must be after the start time', 400);
  }
}

/**
 * Posts or edits the RSVP message for an event and always emits the update.
 * When `throwOnFailure` is false (the common case for background syncs after
 * an RSVP or edit), Discord failures are logged but never bubble up - the
 * database stays the source of truth and a later publish can retry.
 */
async function syncMessage(event: GuildEvent, throwOnFailure: boolean): Promise<GuildEvent> {
  const client = tryGetClient();
  if (!client?.isReady()) {
    if (throwOnFailure)
      throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
    log.warn({ eventId: event.id }, 'Bot is offline, skipping RSVP message update');
    return emitUpdate(event);
  }

  const channel = await resolveSendableChannel(client, event.channelId);
  if (!channel) {
    const message = 'The configured event channel is missing or the bot cannot post there';
    if (throwOnFailure) throw new AppError('invalid_channel', message, 404);
    log.warn({ eventId: event.id, channelId: event.channelId }, message);
    return emitUpdate(event);
  }

  const payload = { embeds: [eventEmbed(event)], components: eventComponents(event) };

  if (event.messageId) {
    try {
      await channel.messages.edit(event.messageId, payload);
      return emitUpdate(event);
    } catch (error) {
      log.warn({ err: error, eventId: event.id }, 'RSVP message is gone, posting a new one');
    }
  }

  try {
    const posted = await channel.send(payload);
    eventsRepository.setMessageId(event.id, posted.id);
    return emitUpdate({ ...event, messageId: posted.id });
  } catch (error) {
    if (throwOnFailure) {
      throw new AppError(
        'external_service',
        `Could not post the event message: ${toErrorMessage(error)}`,
        502,
      );
    }
    log.warn({ err: error, eventId: event.id }, 'Could not post the RSVP message');
    return emitUpdate(event);
  }
}

export async function createEvent(
  input: EventInput & { createdBy: string; createdByName: string },
): Promise<GuildEvent> {
  validateWindow(input.startsAt, input.endsAt ?? null);
  const created = eventsRepository.create(input);
  return syncMessage(created, false);
}

export async function updateEvent(id: number, patch: Partial<EventInput>): Promise<GuildEvent> {
  const existing = getEvent(id);
  const nextStart = patch.startsAt ?? existing.startsAt;
  const nextEnd = patch.endsAt !== undefined ? patch.endsAt : existing.endsAt;
  if (patch.startsAt !== undefined) {
    validateWindow(nextStart, nextEnd ?? null);
  } else if (nextEnd != null && nextEnd <= nextStart) {
    throw new AppError('invalid_end_time', 'The end time must be after the start time', 400);
  }

  const updated = eventsRepository.update(id, patch);
  if (!updated) throw new NotFoundError('That event no longer exists');
  return syncMessage(updated, false);
}

export async function cancelEvent(id: number): Promise<GuildEvent> {
  const updated = eventsRepository.update(id, { cancelled: true });
  if (!updated) throw new NotFoundError('That event no longer exists');
  return syncMessage(updated, false);
}

export async function deleteEvent(id: number): Promise<void> {
  const event = getEvent(id);
  if (event.messageId) {
    const client = tryGetClient();
    if (client?.isReady()) {
      const channel = await resolveSendableChannel(client, event.channelId);
      if (channel) {
        await channel.messages.delete(event.messageId).catch((error: unknown) => {
          log.warn({ err: error, eventId: id }, 'Could not delete the RSVP message');
        });
      }
    }
  }
  eventsRepository.delete(id);
  bus.emit('event:removed', { id });
}

export async function publishEvent(id: number): Promise<GuildEvent> {
  const event = getEvent(id);
  return syncMessage(event, true);
}

export async function setRsvp(
  id: number,
  userId: string,
  displayName: string,
  status: RsvpStatus,
): Promise<GuildEvent> {
  const event = getEvent(id);
  if (event.cancelled) {
    throw new AppError('event_cancelled', 'This event was cancelled', 409);
  }
  if (wouldExceedCapacity(event, userId, status)) {
    throw new AppError('event_full', 'This event has reached its capacity', 409);
  }

  eventsRepository.setRsvp(id, userId, displayName, status);
  const updated = getEvent(id);
  return syncMessage(updated, false);
}

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: 'You are marked as going.',
  maybe: 'You are marked as maybe.',
  declined: "You are marked as can't go.",
};

export async function handleEventInteraction(interaction: ButtonInteraction): Promise<void> {
  const [, , idPart, statusPart] = interaction.customId.split(':');
  if (idPart === undefined || statusPart === undefined) return;
  const eventId = Number(idPart);
  if (!Number.isInteger(eventId) || !RSVP_STATUS_SET.has(statusPart)) return;
  const status = statusPart as RsvpStatus;

  try {
    const member = interaction.member;
    const displayName =
      member && 'displayName' in member
        ? (member.displayName as string)
        : interaction.user.username;
    await setRsvp(eventId, interaction.user.id, displayName, status);
    await interaction.reply({ content: RSVP_LABELS[status], flags: MessageFlags.Ephemeral });
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : 'Something went wrong updating your RSVP.';
    if (!(error instanceof AppError)) {
      log.error(
        { err: error, customId: interaction.customId },
        'Failed to handle RSVP interaction',
      );
    }
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function postReminder(client: Client, event: GuildEvent): Promise<void> {
  const channel = await resolveSendableChannel(client, event.channelId);
  if (!channel) {
    log.warn(
      { eventId: event.id, channelId: event.channelId },
      'Reminder channel is missing or not usable',
    );
    return;
  }

  const interested = event.rsvps.filter(
    (rsvp) => rsvp.status === 'going' || rsvp.status === 'maybe',
  );
  const uniqueIds = [...new Set(interested.map((rsvp) => rsvp.userId))];
  const shown = uniqueIds.slice(0, REMINDER_MENTION_LIMIT);
  const overflow = uniqueIds.length - shown.length;

  const startSeconds = Math.floor(event.startsAt / 1000);
  const body = [
    `**${truncate(event.title, 100)}** starts <t:${startSeconds}:R> (<t:${startSeconds}:F>)`,
    event.location ? `📍 ${truncate(event.location, 200)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const mentions = shown.map((id) => `<@${id}>`).join(' ');
  const suffix = overflow > 0 ? ` +${overflow} more` : '';
  const content = truncate([mentions, `${body}${suffix}`].filter(Boolean).join('\n'), 2000);

  await channel.send({ content, allowedMentions: { users: shown } });
}

async function runReminders(): Promise<void> {
  const due = eventsRepository.dueReminders();
  if (due.length === 0) return;

  const client = tryGetClient();
  if (!client?.isReady()) return;

  for (const event of due) {
    try {
      await postReminder(client, event);
    } catch (error) {
      log.warn({ err: error, eventId: event.id }, 'Could not post the event reminder');
    } finally {
      eventsRepository.markReminderSent(event.id);
    }
  }
}

let reminderJob: Cron | null = null;

/** Starts the once-a-minute reminder scheduler. Safe to call more than once. */
export function startEventScheduler(): void {
  if (reminderJob) return;
  reminderJob = new Cron(
    '* * * * *',
    {
      timezone: config.timezone,
      protect: true,
      catch: (error: unknown) => log.error({ err: error }, 'Event reminder scheduler failed'),
    },
    () => {
      void runReminders().catch((error: unknown) => {
        log.error({ err: error }, 'Event reminder run failed');
      });
    },
  );
}

export function stopEventScheduler(): void {
  reminderJob?.stop();
  reminderJob = null;
}
