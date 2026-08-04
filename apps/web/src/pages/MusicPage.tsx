import type { ReactNode } from 'react';
import { Music2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useGuildsQuery, useGuildChannelsQuery } from '../features/guilds/api';
import { usePlayerQuery } from '../features/music/api';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { NowPlayingCard } from './music/NowPlayingCard';
import { JoinPanel } from './music/JoinPanel';
import { SearchPanel } from './music/SearchPanel';
import { QueuePanel } from './music/QueuePanel';
import { HistoryPanel } from './music/HistoryPanel';

export function MusicPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const player = usePlayerQuery(guildId);
  const channels = useGuildChannelsQuery(guildId);

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader title="Music" description="Control playback and manage the queue." />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader title="Music" description="Control playback and manage the queue." />
        <EmptyState
          icon={<Music2 className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar to control its player."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Music" description="Control playback and manage the queue." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {player.isLoading ? (
            <Skeleton className="h-56" />
          ) : player.isError ? (
            <ErrorState description={errorMessage(player.error)} onRetry={() => player.refetch()} />
          ) : player.data ? (
            <NowPlayingCard guildId={guildId} player={player.data} />
          ) : (
            <JoinPanel guildId={guildId} channels={channels.data ?? []} />
          )}

          <SearchPanel
            guildId={guildId}
            player={player.data ?? null}
            channels={channels.data ?? []}
          />
          <HistoryPanel guildId={guildId} />
        </div>

        <div>
          {player.data ? (
            <QueuePanel guildId={guildId} player={player.data} />
          ) : (
            <EmptyState
              title="No active queue"
              description="Connect to a voice channel to build a queue."
            />
          )}
        </div>
      </div>
    </div>
  );
}
