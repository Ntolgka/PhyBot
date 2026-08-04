import { useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useGuildsQuery, useGuildChannelsQuery } from '../features/guilds/api';
import { useEventsQuery } from '../features/events/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { EventCard } from './events/EventCard';
import { EventFormModal } from './events/EventFormModal';
import { EventDetailsModal } from './events/EventDetailsModal';
import type { GuildEvent } from '@phybot/shared';

export function EventsPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const channels = useGuildChannelsQuery(guildId);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const events = useEventsQuery(guildId, true);
  const [selectedEvent, setSelectedEvent] = useState<GuildEvent | null>(null);
  const [formState, setFormState] = useState<'closed' | 'create' | 'edit'>('closed');

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader title="Events" description="Plan and publish RSVP events for your community." />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader title="Events" description="Plan and publish RSVP events for your community." />
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </div>
    );
  }

  const now = Date.now();
  const allEvents = events.data ?? [];
  const upcoming = allEvents
    .filter((event) => !event.cancelled && event.startsAt >= now)
    .sort((a, b) => a.startsAt - b.startsAt);
  const past = allEvents
    .filter((event) => event.cancelled || event.startsAt < now)
    .sort((a, b) => b.startsAt - a.startsAt);
  const visible = tab === 'upcoming' ? upcoming : past;
  const liveSelectedEvent = selectedEvent
    ? (allEvents.find((event) => event.id === selectedEvent.id) ?? selectedEvent)
    : null;

  return (
    <div>
      <PageHeader
        title="Events"
        description="Plan and publish RSVP events for your community."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setFormState('create')}
          >
            New event
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as 'upcoming' | 'past')}
        items={[
          {
            value: 'upcoming',
            label: 'Upcoming',
            badge: <span className="text-xs text-ink-faint">{upcoming.length}</span>,
          },
          {
            value: 'past',
            label: 'Past & cancelled',
            badge: <span className="text-xs text-ink-faint">{past.length}</span>,
          },
        ]}
        className="mb-4"
      />

      {events.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : events.isError ? (
        <ErrorState description={errorMessage(events.error)} onRetry={() => events.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title={tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
          description={tab === 'upcoming' ? 'Create an event to get started.' : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} onClick={() => setSelectedEvent(event)} />
          ))}
        </div>
      )}

      {formState === 'create' && (
        <EventFormModal
          guildId={guildId}
          channels={channels.data ?? []}
          event={null}
          onClose={() => setFormState('closed')}
        />
      )}

      {formState === 'edit' && liveSelectedEvent && (
        <EventFormModal
          guildId={guildId}
          channels={channels.data ?? []}
          event={liveSelectedEvent}
          onClose={() => setFormState('closed')}
        />
      )}

      {formState === 'closed' && liveSelectedEvent && (
        <EventDetailsModal
          event={liveSelectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => setFormState('edit')}
        />
      )}
    </div>
  );
}
