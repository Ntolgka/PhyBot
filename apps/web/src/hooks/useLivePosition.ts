import { useEffect, useState } from 'react';
import type { PlayerSnapshot } from '@phybot/shared';

/** Interpolates the current playback position between server updates so the
 * progress bar advances smoothly instead of jumping once a second. */
export function useLivePosition(player: PlayerSnapshot | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (player?.status !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [player?.status]);

  if (!player || !player.current) return 0;
  if (player.status !== 'playing') return player.position;

  const elapsed = (now - player.updatedAt) / 1000;
  const duration = player.current.isLive ? Number.POSITIVE_INFINITY : player.current.duration;
  return Math.min(Math.max(player.position + elapsed, 0), duration);
}
