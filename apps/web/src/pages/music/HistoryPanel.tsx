import { useState } from 'react';
import type { ReactNode } from 'react';
import { formatDuration } from '@phybot/shared';
import { History, ListPlus, Music2, TrendingUp } from 'lucide-react';
import { useHistoryQuery, usePlayMutation, useTopTracksQuery } from '../../features/music/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { SkeletonText } from '../../components/ui/Skeleton';
import { SourceBadge } from '../../components/common/SourceBadge';
import { formatRelativeTime } from '../../lib/format';
import { errorMessage } from '../../lib/api';

export function HistoryPanel({ guildId }: { guildId: string }): ReactNode {
  const [tab, setTab] = useState<'history' | 'top'>('history');
  const history = useHistoryQuery(guildId);
  const topTracks = useTopTracksQuery(guildId);
  const playMutation = usePlayMutation(guildId);

  return (
    <Card padded={false}>
      <div className="px-5 pt-4">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as 'history' | 'top')}
          items={[
            { value: 'history', label: 'Recently played', icon: <History className="size-4" /> },
            { value: 'top', label: 'Top tracks', icon: <TrendingUp className="size-4" /> },
          ]}
        />
      </div>

      <div className="px-5 py-4">
        <TabPanel value="history" activeValue={tab}>
          {history.isLoading ? (
            <SkeletonText lines={4} />
          ) : history.isError ? (
            <ErrorState
              description={errorMessage(history.error)}
              onRetry={() => history.refetch()}
            />
          ) : !history.data || history.data.length === 0 ? (
            <EmptyState icon={<History className="size-8" />} title="No history yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.data.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-surface-3">
                    <Music2 className="size-4 text-ink-faint" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{entry.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-dim">
                      <span className="truncate">{entry.author}</span>
                      <SourceBadge source={entry.source} />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                    {formatDuration(entry.duration, false)}
                  </span>
                  <span className="hidden shrink-0 text-xs text-ink-faint sm:inline">
                    {formatRelativeTime(entry.playedAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add to end of queue"
                    onClick={() => playMutation.mutate({ query: entry.url, next: false })}
                  >
                    <ListPlus className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>

        <TabPanel value="top" activeValue={tab}>
          {topTracks.isLoading ? (
            <SkeletonText lines={4} />
          ) : topTracks.isError ? (
            <ErrorState
              description={errorMessage(topTracks.error)}
              onRetry={() => topTracks.refetch()}
            />
          ) : !topTracks.data || topTracks.data.length === 0 ? (
            <EmptyState icon={<TrendingUp className="size-8" />} title="Not enough plays yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {topTracks.data.map((track, index) => (
                <li key={`${track.url}-${index}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{track.title}</p>
                    <p className="truncate text-xs text-ink-dim">{track.author}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">{track.plays} plays</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add to end of queue"
                    onClick={() => playMutation.mutate({ query: track.url, next: false })}
                  >
                    <ListPlus className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </div>
    </Card>
  );
}
