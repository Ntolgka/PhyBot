import type { ReactNode } from 'react';
import type { FluxStatus } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const BACKEND_LABEL: Record<FluxStatus['backend'], string> = {
  cuda: 'NVIDIA CUDA',
  vulkan: 'Vulkan',
  cpu: 'CPU',
};

function StatusRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-ink-dim">{label}</span>
      {children}
    </div>
  );
}

export function FluxStatusPanel({ status }: { status: FluxStatus }): ReactNode {
  return (
    <Card title="Engine status" description="Live readiness of the local image generator.">
      <div className="divide-y divide-border">
        <StatusRow label="Installed">
          <Badge variant={status.installed ? 'success' : 'danger'}>
            {status.installed ? 'Yes' : 'No'}
          </Badge>
        </StatusRow>
        <StatusRow label="Models ready">
          <Badge variant={status.modelsReady ? 'success' : 'danger'}>
            {status.modelsReady ? 'Yes' : 'No'}
          </Badge>
        </StatusRow>
        <StatusRow label="Backend">
          <Badge variant="neutral">{BACKEND_LABEL[status.backend]}</Badge>
        </StatusRow>
        <StatusRow label="Engine">
          <Badge variant={status.busy ? 'warning' : 'neutral'}>
            {status.busy ? 'Busy' : 'Idle'}
          </Badge>
        </StatusRow>
        {status.queued > 0 && (
          <StatusRow label="Queued jobs">
            <span className="text-sm tabular-nums text-ink">{status.queued}</span>
          </StatusRow>
        )}
      </div>

      <p className="mt-3 truncate text-xs text-ink-faint" title={status.directory}>
        Files live in {status.directory}
      </p>

      {status.lastError && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {status.lastError}
        </div>
      )}
    </Card>
  );
}
