import type { ReactNode } from 'react';
import type { Sound } from '@phybot/shared';
import { formatDuration } from '@phybot/shared';
import { Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { usePlaySoundMutation } from '../../features/soundboard/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';

export function SoundCard({
  sound,
  guildId,
  onEdit,
  onDelete,
}: {
  sound: Sound;
  guildId: string;
  onEdit: () => void;
  onDelete: () => void;
}): ReactNode {
  const playMutation = usePlaySoundMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);

  function handlePlay(): void {
    playMutation.mutate(sound.id, {
      onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
    });
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={handlePlay}
        disabled={playMutation.isPending}
        className="focus-ring flex flex-1 flex-col items-center gap-2 px-4 py-6 text-center disabled:cursor-not-allowed"
        aria-label={`Play ${sound.name}`}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-3 text-2xl">
          {playMutation.isPending ? (
            <Loader2 className="size-5 animate-spin text-ink-dim" aria-hidden="true" />
          ) : sound.emoji ? (
            sound.emoji
          ) : (
            <Play className="size-5 text-ink-dim" aria-hidden="true" />
          )}
        </span>
        <span className="max-w-full truncate text-sm font-medium text-ink">{sound.name}</span>
        {sound.description && (
          <span className="line-clamp-2 text-xs text-ink-dim">{sound.description}</span>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <span>{formatDuration(sound.durationSeconds)}</span>
          <span aria-hidden="true">•</span>
          <span>
            {sound.uses} play{sound.uses === 1 ? '' : 's'}
          </span>
          {sound.slash && <Badge variant="accent">/{sound.name}</Badge>}
        </div>
      </button>
      <div className="flex items-center justify-end gap-1 border-t border-border px-2 py-1.5">
        <Button variant="ghost" size="icon" aria-label={`Edit ${sound.name}`} onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Delete ${sound.name}`} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
