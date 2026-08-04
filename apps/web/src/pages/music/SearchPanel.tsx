import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { ChannelSummary, PlayerSnapshot, SearchResult } from '@phybot/shared';
import { formatDuration } from '@phybot/shared';
import { ListEnd, ListPlus, Music2, Play, Search } from 'lucide-react';
import { usePlayMutation, useSearchQuery, useSkipMutation } from '../../features/music/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { SkeletonText } from '../../components/ui/Skeleton';
import { SourceBadge } from '../../components/common/SourceBadge';
import { errorMessage } from '../../lib/api';

export function SearchPanel({
  guildId,
  player,
  channels,
}: {
  guildId: string;
  player: PlayerSnapshot | null;
  channels: ChannelSummary[];
}): ReactNode {
  const [queryText, setQueryText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [shuffleOnImport, setShuffleOnImport] = useState(false);
  const [voiceChannelId, setVoiceChannelId] = useState('');

  const voiceChannels = channels.filter(
    (channel) => channel.type === 'voice' || channel.type === 'stage',
  );
  const needsVoiceChannel = player === null;

  useEffect(() => {
    if (voiceChannelId || voiceChannels.length === 0) return;
    const usable = voiceChannels.find((channel) => channel.usable) ?? voiceChannels[0];
    if (usable) setVoiceChannelId(usable.id);
  }, [voiceChannels, voiceChannelId]);

  const searchQuery = useSearchQuery(searchTerm);
  const playMutation = usePlayMutation(guildId);
  const skipMutation = useSkipMutation(guildId);

  function buildBaseRequest(query: string) {
    return {
      query,
      shuffle: shuffleOnImport,
      ...(needsVoiceChannel && voiceChannelId ? { voiceChannelId } : {}),
    };
  }

  function addTrack(query: string, mode: 'now' | 'next' | 'end'): void {
    if (!query.trim()) return;
    playMutation.mutate(
      { ...buildBaseRequest(query), next: mode !== 'end' },
      {
        onSuccess: () => {
          // "Play now" inserts at the front of the queue; if something else
          // was already playing, skip straight to the track we just added.
          if (mode === 'now' && player?.status === 'playing') {
            skipMutation.mutate({});
          }
        },
      },
    );
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearchTerm(queryText.trim());
  }

  const blockedByVoice = needsVoiceChannel && voiceChannels.length === 0;

  return (
    <Card title="Add music" description="Paste a link or search YouTube, SoundCloud and Spotify.">
      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3">
        <Input
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          placeholder="Paste a link or type a song, artist or playlist"
          leadingIcon={<Search className="size-4" aria-hidden="true" />}
          aria-label="Search or link"
        />

        {needsVoiceChannel && (
          <Select
            label="Voice channel"
            hint={
              blockedByVoice ? 'No usable voice channels found.' : 'Required to start playback.'
            }
            value={voiceChannelId}
            onChange={(event) => setVoiceChannelId(event.target.value)}
            options={voiceChannels.map((channel) => ({
              value: channel.id,
              label: channel.name,
              disabled: !channel.usable,
            }))}
            placeholder="Select a voice channel"
            disabled={blockedByVoice}
          />
        )}

        <label className="flex items-center gap-2 text-sm text-ink-dim">
          <input
            type="checkbox"
            checked={shuffleOnImport}
            onChange={(event) => setShuffleOnImport(event.target.checked)}
            className="focus-ring size-4 rounded border-border-strong bg-surface-2 accent-[var(--color-accent-2)]"
          />
          Shuffle playlist on import
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="secondary"
            leadingIcon={<Search className="size-4" aria-hidden="true" />}
          >
            Search
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!queryText.trim() || (needsVoiceChannel && !voiceChannelId)}
            pending={playMutation.isPending}
            leadingIcon={<Play className="size-4" aria-hidden="true" />}
            onClick={() => addTrack(queryText, 'now')}
          >
            Play now
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!queryText.trim() || (needsVoiceChannel && !voiceChannelId)}
            leadingIcon={<ListPlus className="size-4" aria-hidden="true" />}
            onClick={() => addTrack(queryText, 'next')}
          >
            Add next
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!queryText.trim() || (needsVoiceChannel && !voiceChannelId)}
            leadingIcon={<ListEnd className="size-4" aria-hidden="true" />}
            onClick={() => addTrack(queryText, 'end')}
          >
            Add to end
          </Button>
        </div>
      </form>

      {searchTerm && (
        <div className="mt-5 border-t border-border pt-4">
          {searchQuery.isLoading ? (
            <SkeletonText lines={4} />
          ) : searchQuery.isError ? (
            <ErrorState
              description={errorMessage(searchQuery.error)}
              onRetry={() => searchQuery.refetch()}
            />
          ) : !searchQuery.data || searchQuery.data.length === 0 ? (
            <EmptyState
              icon={<Music2 className="size-8" />}
              title="No results"
              description="Try a different search."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {searchQuery.data.map((result) => (
                <SearchResultRow
                  key={result.url}
                  result={result}
                  disabled={needsVoiceChannel && !voiceChannelId}
                  onAdd={(mode) => addTrack(result.url, mode)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function SearchResultRow({
  result,
  disabled,
  onAdd,
}: {
  result: SearchResult;
  disabled: boolean;
  onAdd: (mode: 'now' | 'next' | 'end') => void;
}): ReactNode {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {result.thumbnail ? (
        <img src={result.thumbnail} alt="" className="size-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-3">
          <Music2 className="size-4 text-ink-faint" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{result.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-dim">
          <span className="truncate">{result.author}</span>
          <SourceBadge source={result.source} />
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
        {formatDuration(result.duration, result.isLive)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Play now"
          disabled={disabled}
          onClick={() => onAdd('now')}
        >
          <Play className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Add next"
          disabled={disabled}
          onClick={() => onAdd('next')}
        >
          <ListPlus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Add to end"
          disabled={disabled}
          onClick={() => onAdd('end')}
        >
          <ListEnd className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
