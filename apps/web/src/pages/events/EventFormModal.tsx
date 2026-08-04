import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { ChannelSummary, EventInput, GuildEvent } from '@phybot/shared';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { ChannelSelect } from '../../components/common/ChannelSelect';
import { useCreateEventMutation, useUpdateEventMutation } from '../../features/events/api';
import { epochMsToLocalDateTime, localDateTimeToEpochMs } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';

export function EventFormModal({
  guildId,
  channels,
  event,
  onClose,
}: {
  guildId: string;
  channels: ChannelSummary[];
  event: GuildEvent | null;
  onClose: () => void;
}): ReactNode {
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [channelId, setChannelId] = useState<string | null>(event?.channelId ?? null);
  const [startsAt, setStartsAt] = useState(event ? epochMsToLocalDateTime(event.startsAt) : '');
  const [endsAt, setEndsAt] = useState(event?.endsAt ? epochMsToLocalDateTime(event.endsAt) : '');
  const [capacity, setCapacity] = useState(event?.capacity ?? 0);
  const [reminderMinutes, setReminderMinutes] = useState(event?.reminderMinutes ?? 60);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateEventMutation();
  const updateMutation = useUpdateEventMutation();
  const pushToast = useUiStore((state) => state.pushToast);
  const pending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>): void {
    formEvent.preventDefault();
    const startsAtMs = localDateTimeToEpochMs(startsAt);
    if (!title.trim() || !channelId || startsAtMs === null) {
      setError('Title, channel and start time are required.');
      return;
    }
    const endsAtMs = endsAt ? localDateTimeToEpochMs(endsAt) : null;

    const onSuccess = (): void => {
      pushToast({ level: 'success', message: event ? 'Event updated.' : 'Event created.' });
      onClose();
    };
    const onError = (err: unknown): void => {
      setError(err instanceof Error ? err.message : 'Could not save the event.');
    };

    if (event) {
      updateMutation.mutate(
        {
          id: event.id,
          patch: {
            title: title.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            channelId,
            startsAt: startsAtMs,
            endsAt: endsAtMs,
            capacity,
            reminderMinutes,
          },
        },
        { onSuccess, onError },
      );
    } else {
      const input: EventInput = {
        guildId,
        channelId,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startsAt: startsAtMs,
        endsAt: endsAtMs,
        capacity,
        reminderMinutes,
      };
      createMutation.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" variant="primary" pending={pending}>
            {event ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <Input
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={200}
        />
        <ChannelSelect
          label="Announcement channel"
          channels={channels}
          types={['text', 'announcement']}
          value={channelId}
          onChange={setChannelId}
          allowNone={false}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="datetime-local"
            label="Starts at"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
          <Input
            type="datetime-local"
            label="Ends at"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="number"
            label="Capacity"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            hint="0 means unlimited."
          />
          <Input
            type="number"
            label="Reminder minutes before start"
            min={0}
            max={10080}
            value={reminderMinutes}
            onChange={(e) => setReminderMinutes(Number(e.target.value))}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
