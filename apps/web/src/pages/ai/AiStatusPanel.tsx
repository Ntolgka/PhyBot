import type { ReactNode } from 'react';
import type { AiRuntimeStatus } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

function StatusRow({ label, ready }: { label: string; ready: boolean }): ReactNode {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-ink-dim">{label}</span>
      <Badge variant={ready ? 'success' : 'neutral'}>{ready ? 'Ready' : 'Not ready'}</Badge>
    </div>
  );
}

export function AiStatusPanel({ status }: { status: AiRuntimeStatus }): ReactNode {
  return (
    <Card title="Runtime status" description="Live readiness of each AI capability.">
      <div className="divide-y divide-border">
        <StatusRow label="Text replies" ready={status.textReady} />
        <StatusRow label="Speech-to-text" ready={status.sttReady} />
        <StatusRow label="Text-to-speech" ready={status.ttsReady} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-faint">Configured providers:</span>
        {status.configuredProviders.length === 0 ? (
          <span className="text-xs text-ink-faint">None</span>
        ) : (
          status.configuredProviders.map((provider) => (
            <Badge key={provider} variant="neutral">
              {provider}
            </Badge>
          ))
        )}
      </div>

      {status.listeningGuilds.length > 0 && (
        <p className="mt-3 text-xs text-ink-faint">
          Listening in {status.listeningGuilds.length} server
          {status.listeningGuilds.length === 1 ? '' : 's'}.
        </p>
      )}

      {status.lastError && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {status.lastError}
        </div>
      )}
    </Card>
  );
}
