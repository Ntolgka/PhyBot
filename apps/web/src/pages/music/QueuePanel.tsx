import { useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerSnapshot, Track } from '@phybot/shared';
import { formatDuration } from '@phybot/shared';
import { ArrowDown, ArrowUp, ListMusic, Music2, Play, Trash2, X } from 'lucide-react';
import {
  useClearQueueMutation,
  useJumpMutation,
  useMoveMutation,
  useRemoveQueueItemMutation,
} from '../../features/music/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { SourceBadge } from '../../components/common/SourceBadge';

function QueueRow({
  track,
  index,
  isFirst,
  isLast,
  onJump,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  track: Track;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onJump: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}): ReactNode {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">
        {index + 1}
      </span>
      {track.thumbnail ? (
        <img src={track.thumbnail} alt="" className="size-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-3">
          <Music2 className="size-4 text-ink-faint" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{track.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-dim">
          <span className="truncate">{track.author}</span>
          <SourceBadge source={track.source} />
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
        {formatDuration(track.duration, track.isLive)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" aria-label="Play now" onClick={onJump}>
          <Play className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Move up"
          disabled={isFirst}
          onClick={onMoveUp}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Move down"
          disabled={isLast}
          onClick={onMoveDown}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Remove from queue" onClick={onRemove}>
          <X className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function QueuePanel({
  guildId,
  player,
}: {
  guildId: string;
  player: PlayerSnapshot;
}): ReactNode {
  const [confirmClear, setConfirmClear] = useState(false);
  const jumpMutation = useJumpMutation(guildId);
  const moveMutation = useMoveMutation(guildId);
  const removeMutation = useRemoveQueueItemMutation(guildId);
  const clearMutation = useClearQueueMutation(guildId);

  const { queue, queueDuration } = player;
  const durationLabel =
    queueDuration < 0 ? 'includes a live stream' : formatDuration(queueDuration, false) + ' total';

  return (
    <Card
      title="Queue"
      description={
        queue.length > 0
          ? `${queue.length} track${queue.length === 1 ? '' : 's'} · ${durationLabel}`
          : undefined
      }
      actions={
        queue.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
            onClick={() => setConfirmClear(true)}
          >
            Clear
          </Button>
        )
      }
    >
      {queue.length === 0 ? (
        <EmptyState
          icon={<ListMusic className="size-8" />}
          title="Queue is empty"
          description="Search for a track below to add something."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {queue.map((track, index) => (
            <QueueRow
              key={track.id}
              track={track}
              index={index}
              isFirst={index === 0}
              isLast={index === queue.length - 1}
              onJump={() => jumpMutation.mutate({ index })}
              onMoveUp={() => moveMutation.mutate({ from: index, to: index - 1 })}
              onMoveDown={() => moveMutation.mutate({ from: index, to: index + 1 })}
              onRemove={() => removeMutation.mutate(track.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the queue?"
        description="This removes every upcoming track. The current track keeps playing."
        confirmLabel="Clear queue"
        danger
        pending={clearMutation.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() =>
          clearMutation.mutate(undefined, {
            onSuccess: () => setConfirmClear(false),
          })
        }
      />
    </Card>
  );
}
