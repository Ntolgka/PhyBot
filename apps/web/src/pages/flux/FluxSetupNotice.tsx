import type { ReactNode } from 'react';
import type { FluxStatus } from '@phybot/shared';
import { TriangleAlert } from 'lucide-react';

export function FluxSetupNotice({ status }: { status: FluxStatus }): ReactNode {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-ink">
            {status.installed ? 'FLUX is missing model files' : 'FLUX is not installed yet'}
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            Run{' '}
            <code className="rounded bg-surface-3 px-1.5 py-0.5 text-xs">npm run flux:setup</code>{' '}
            in the project folder, then reopen this page.
          </p>
        </div>
      </div>
      {status.missing.length > 0 && (
        <ul className="ml-8 list-disc text-sm text-ink-dim">
          {status.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
