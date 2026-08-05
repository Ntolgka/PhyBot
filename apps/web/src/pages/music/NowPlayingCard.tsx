import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerSnapshot } from '@phybot/shared';
import {
  Dices,
  LogOut,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  FastForward,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SEEK_STEP_SECONDS } from '@phybot/shared';
import { useLivePosition } from '../../hooks/useLivePosition';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import {
  useAutoplayMutation,
  useLeaveMutation,
  useLoopMutation,
  usePauseMutation,
  usePreviousMutation,
  useRestartMutation,
  useResumeMutation,
  useSeekMutation,
  useSeekRelativeMutation,
  useShuffleMutation,
  useShuffleQueueMutation,
  useSkipMutation,
  useStopMutation,
  useVolumeMutation,
} from '../../features/music/api';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SourceBadge } from '../../components/common/SourceBadge';
import { SeekBar } from './SeekBar';
import { cn } from '../../lib/cn';

const LOOP_SEQUENCE = ['off', 'track', 'queue'] as const;

function nextLoopMode(mode: PlayerSnapshot['loop']): PlayerSnapshot['loop'] {
  const index = LOOP_SEQUENCE.indexOf(mode);
  return LOOP_SEQUENCE[(index + 1) % LOOP_SEQUENCE.length] ?? 'off';
}

export function NowPlayingCard({
  guildId,
  player,
}: {
  guildId: string;
  player: PlayerSnapshot;
}): ReactNode {
  const position = useLivePosition(player);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [volume, setVolume] = useState(player.volume);

  const pauseMutation = usePauseMutation(guildId);
  const resumeMutation = useResumeMutation(guildId);
  const skipMutation = useSkipMutation(guildId);
  const previousMutation = usePreviousMutation(guildId);
  const restartMutation = useRestartMutation(guildId);
  const stopMutation = useStopMutation(guildId);
  const seekMutation = useSeekMutation(guildId);
  const seekRelativeMutation = useSeekRelativeMutation(guildId);
  const volumeMutation = useVolumeMutation(guildId);
  const loopMutation = useLoopMutation(guildId);
  const shuffleMutation = useShuffleMutation(guildId);
  const shuffleQueueMutation = useShuffleQueueMutation(guildId);
  const autoplayMutation = useAutoplayMutation(guildId);
  const leaveMutation = useLeaveMutation(guildId);

  const commitVolume = useDebouncedCallback((value: number) => {
    volumeMutation.mutate({ volume: value });
  }, 300);

  // Only re-sync when the guild or the server-confirmed volume changes, not
  // on every unrelated player update, so a slider drag isn't interrupted.
  useEffect(() => {
    setVolume(player.volume);
  }, [guildId, player.volume]);

  const current = player.current;
  const isPlaying = player.status === 'playing';
  const canControl = current !== null;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const LoopIcon = player.loop === 'track' ? Repeat1 : Repeat;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        {current?.thumbnail ? (
          <img
            src={current.thumbnail}
            alt=""
            className="size-24 shrink-0 rounded-lg object-cover shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)] sm:size-28"
          />
        ) : (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-surface-3 sm:size-28">
            <Music2 className="size-8 text-ink-faint" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={current.source} />
                {current.isLive && <Badge variant="danger">LIVE</Badge>}
              </div>
              <h2 className="mt-1.5 truncate text-lg font-semibold text-ink" title={current.title}>
                {current.title}
              </h2>
              <p className="truncate text-sm text-ink-dim">{current.author}</p>
              <p className="mt-1 truncate text-xs text-ink-faint">
                Requested by {current.requestedByName}
                {player.voiceChannelName ? ` · in ${player.voiceChannelName}` : ''}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink">Queue is empty</h2>
              <p className="text-sm text-ink-dim">
                {player.voiceChannelName
                  ? `Connected to ${player.voiceChannelName}`
                  : 'Not connected'}
              </p>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
          onClick={() => setConfirmLeave(true)}
          className="sm:self-start"
        >
          Leave
        </Button>
      </div>

      <div className="px-5">
        <SeekBar
          position={position}
          duration={current?.duration ?? 0}
          live={current?.isLive ?? false}
          disabled={!canControl}
          onSeek={(value) => seekMutation.mutate({ position: value })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 p-5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous track"
          disabled={!canControl || player.history.length === 0}
          onClick={() => previousMutation.mutate()}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Rewind ${SEEK_STEP_SECONDS} seconds`}
          disabled={!canControl}
          onClick={() => seekRelativeMutation.mutate({ delta: -SEEK_STEP_SECONDS })}
        >
          <Rewind className="size-4" />
        </Button>
        <Button
          variant="primary"
          size="icon"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!canControl}
          pending={pauseMutation.isPending || resumeMutation.isPending}
          onClick={() => (isPlaying ? pauseMutation.mutate() : resumeMutation.mutate())}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}
          disabled={!canControl}
          onClick={() => seekRelativeMutation.mutate({ delta: SEEK_STEP_SECONDS })}
        >
          <FastForward className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Skip to next track"
          disabled={!canControl && player.queue.length === 0}
          onClick={() => skipMutation.mutate({})}
        >
          <SkipForward className="size-4" />
        </Button>

        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Play again from the start"
          disabled={!canControl}
          onClick={() => restartMutation.mutate()}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Stop and clear playback"
          disabled={!canControl}
          onClick={() => stopMutation.mutate()}
        >
          <Square className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Loop mode: ${player.loop}`}
          aria-pressed={player.loop !== 'off'}
          className={cn(player.loop !== 'off' && 'text-accent-3')}
          onClick={() => loopMutation.mutate({ mode: nextLoopMode(player.loop) })}
        >
          <LoopIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          // The mode keeps re-drawing the next track, which is not the same as
          // mixing the queue once; the labels have to make that obvious.
          title="Random order: pick the next track at random every time"
          aria-label="Toggle random order"
          aria-pressed={player.shuffle}
          className={cn(player.shuffle && 'text-accent-3')}
          onClick={() => shuffleMutation.mutate({ enabled: !player.shuffle })}
        >
          <Shuffle className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Mix the queue once and keep that order"
          aria-label="Mix queue now"
          disabled={player.queue.length < 2}
          onClick={() => shuffleQueueMutation.mutate()}
        >
          <Dices className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle autoplay"
          aria-pressed={player.autoplay}
          className={cn(player.autoplay && 'text-accent-3')}
          onClick={() => autoplayMutation.mutate({ enabled: !player.autoplay })}
        >
          <Sparkles className="size-4" />
        </Button>

        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

        <div className="flex w-36 items-center gap-2">
          <VolumeIcon className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={200}
            value={volume}
            onChange={(event) => {
              const value = Number(event.target.value);
              setVolume(value);
              commitVolume(value);
            }}
            aria-label="Volume"
            className="focus-ring w-full"
          />
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">
            {volume}
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave voice channel?"
        description="This stops playback and disconnects the bot from voice. The queue will be cleared."
        confirmLabel="Leave"
        danger
        pending={leaveMutation.isPending}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() =>
          leaveMutation.mutate(undefined, {
            onSuccess: () => setConfirmLeave(false),
          })
        }
      />
    </div>
  );
}
