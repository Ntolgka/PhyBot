import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerSnapshot } from '@phybot/shared';
import { Mic2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';
import { useLyricsQuery } from '../../features/music/api';

/** Seconds of local extrapolation allowed between server updates. */
const MAX_ESTIMATED_DRIFT = 10;

/**
 * Playback position arrives with each player update, a few seconds apart. The
 * clock is advanced locally in between so the highlight moves with the song
 * instead of stepping every few seconds.
 */
function useEstimatedPosition(player: PlayerSnapshot): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (player.status !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [player.status]);

  if (player.status !== 'playing') return player.position;
  // updatedAt is the server's clock and `now` is the browser's, so a machine
  // whose time is off would otherwise throw the highlight far down the song.
  // Updates arrive every few seconds; anything beyond that is skew, not elapsed
  // time.
  const elapsed = Math.min(Math.max((now - player.updatedAt) / 1000, 0), MAX_ESTIMATED_DRIFT);
  return player.position + elapsed;
}

export function LyricsPanel({
  guildId,
  player,
}: {
  guildId: string;
  player: PlayerSnapshot;
}): ReactNode {
  const trackUrl = player.current?.url ?? null;
  const lyrics = useLyricsQuery(guildId, trackUrl);
  const position = useEstimatedPosition(player);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  const lines = lyrics.data?.lines ?? [];
  const activeIndex = useMemo(() => {
    let index = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if ((lines[i]?.at ?? 0) <= position) index = i;
      else break;
    }
    return index;
  }, [lines, position]);

  // Keeps the sung line in the middle of the box without hijacking the page.
  // Measured from the two rectangles rather than offsetTop, which is relative
  // to the nearest positioned ancestor and overshot the whole card height.
  useEffect(() => {
    const container = listRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    const offsetWithin = active.getBoundingClientRect().top - container.getBoundingClientRect().top;
    const target =
      container.scrollTop + offsetWithin - container.clientHeight / 2 + active.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight)),
      behavior: 'smooth',
    });
  }, [activeIndex]);

  if (!player.current) return null;

  return (
    <Card
      title="Lyrics"
      description={
        lyrics.data
          ? `${lyrics.data.artist} - ${lyrics.data.title}${lyrics.data.synced ? '' : ' (not timed)'}`
          : 'Words for the current track'
      }
    >
      {lyrics.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : lyrics.isError ? (
        <ErrorState description={errorMessage(lyrics.error)} onRetry={() => lyrics.refetch()} />
      ) : !lyrics.data ? (
        <EmptyState
          icon={<Mic2 className="size-8" />}
          title="No lyrics found"
          description="Nothing matched this track in the lyrics database."
        />
      ) : lyrics.data.synced ? (
        <div ref={listRef} className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-2">
          {lines.map((line, index) => (
            <p
              key={`${line.at}-${index}`}
              ref={index === activeIndex ? activeRef : undefined}
              className={cn(
                'text-sm transition-colors duration-200',
                index === activeIndex
                  ? 'font-medium text-ink'
                  : index < activeIndex
                    ? 'text-ink-faint'
                    : 'text-ink-dim',
              )}
            >
              {line.text || ' '}
            </p>
          ))}
        </div>
      ) : (
        <p className="max-h-80 overflow-y-auto whitespace-pre-wrap pr-2 text-sm text-ink-dim">
          {lyrics.data.plain}
        </p>
      )}

      <p className="mt-3 text-xs text-ink-faint">{lyrics.data?.source ?? 'LRCLIB'}</p>
    </Card>
  );
}
