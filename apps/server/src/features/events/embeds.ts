import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { GuildEvent, RsvpStatus } from '@phybot/shared';
import { truncate } from '@phybot/shared';
import { formatAttendeeList, rsvpsByStatus } from './logic.js';

const EVENT_COLOR = 0x7c5cff;
const CANCELLED_COLOR = 0xed4245;

export const EVENT_BUTTON_PREFIX = 'event:rsvp';

export function eventButtonId(id: number, status: RsvpStatus): string {
  return `${EVENT_BUTTON_PREFIX}:${id}:${status}`;
}

export function eventEmbed(event: GuildEvent): EmbedBuilder {
  const startSeconds = Math.floor(event.startsAt / 1000);
  const going = rsvpsByStatus(event.rsvps, 'going');
  const maybe = rsvpsByStatus(event.rsvps, 'maybe');
  const declined = rsvpsByStatus(event.rsvps, 'declined');

  const detailLines = [`<t:${startSeconds}:F> (<t:${startSeconds}:R>)`];
  if (event.endsAt) detailLines.push(`Ends <t:${Math.floor(event.endsAt / 1000)}:F>`);
  if (event.location) detailLines.push(`📍 ${truncate(event.location, 200)}`);

  const description = [event.description, detailLines.join('\n')].filter(Boolean).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(event.cancelled ? CANCELLED_COLOR : EVENT_COLOR)
    .setTitle(
      event.cancelled ? `[CANCELLED] ${truncate(event.title, 90)}` : truncate(event.title, 100),
    )
    .setDescription(truncate(description, 4000))
    .addFields(
      {
        name: `Going (${going.length}${event.capacity > 0 ? `/${event.capacity}` : ''})`,
        value: formatAttendeeList(going),
      },
      { name: `Maybe (${maybe.length})`, value: formatAttendeeList(maybe) },
      { name: `Can't go (${declined.length})`, value: formatAttendeeList(declined) },
    )
    .setFooter({ text: `Organised by ${event.createdByName}` })
    .setTimestamp(event.startsAt);

  return embed;
}

export function eventComponents(event: GuildEvent): ActionRowBuilder<ButtonBuilder>[] {
  const disabled = event.cancelled;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(eventButtonId(event.id, 'going'))
      .setLabel('Going')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(eventButtonId(event.id, 'maybe'))
      .setLabel('Maybe')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(eventButtonId(event.id, 'declined'))
      .setLabel("Can't go")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
  return [row];
}
