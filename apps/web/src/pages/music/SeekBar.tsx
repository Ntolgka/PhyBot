import { useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { formatDuration } from '@phybot/shared';
import { cn } from '../../lib/cn';

export interface SeekBarProps {
  position: number;
  duration: number;
  live: boolean;
  disabled?: boolean;
  onSeek: (position: number) => void;
}

/** Draggable progress bar. Keeps a local value while the user is actively
 * dragging so the UI feels immediate, and only fires `onSeek` once the drag
 * (or arrow-key adjustment) is committed. */
export function SeekBar({ position, duration, live, disabled, onSeek }: SeekBarProps): ReactNode {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const safeDuration = live || duration <= 0 ? 0 : duration;
  const displayed = dragValue ?? position;

  function commit(value: number): void {
    const clamped = Math.min(Math.max(value, 0), safeDuration || value);
    onSeek(clamped);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setDragValue(Number(event.target.value));
  }

  function handlePointerUp(): void {
    if (dragValue !== null) {
      commit(dragValue);
      setDragValue(null);
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLInputElement>): void {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      commit(Number((event.target as HTMLInputElement).value));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="range"
        min={0}
        max={live || safeDuration <= 0 ? 100 : Math.floor(safeDuration)}
        value={live || safeDuration <= 0 ? 0 : Math.floor(displayed)}
        disabled={disabled || live || safeDuration <= 0}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onKeyUp={handleKeyUp}
        aria-label="Seek"
        className={cn('focus-ring w-full', (disabled || live || safeDuration <= 0) && 'opacity-50')}
      />
      <div className="flex items-center justify-between text-xs tabular-nums text-ink-faint">
        <span>{formatDuration(displayed, false)}</span>
        <span>{formatDuration(safeDuration, live)}</span>
      </div>
    </div>
  );
}
