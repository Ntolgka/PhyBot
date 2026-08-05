import type { ReactNode } from 'react';
import type { FluxProgress } from '@phybot/shared';
import { Loader2 } from 'lucide-react';
import { clamp } from '@phybot/shared';

export function FluxProgressPanel({ progress }: { progress: FluxProgress }): ReactNode {
  const percent = Math.round(clamp(progress.step / Math.max(1, progress.totalSteps), 0, 1) * 100);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-2 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-ink">
          <Loader2 className="size-4 animate-spin text-accent-3" aria-hidden="true" />
          Rendering image {progress.index} of {progress.total}
        </span>
        <span className="tabular-nums text-ink-dim">
          step {progress.step}/{progress.totalSteps}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Rendering image ${progress.index} of ${progress.total}`}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className="accent-gradient h-full rounded-full transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-ink-faint">{progress.message}</p>
    </div>
  );
}
