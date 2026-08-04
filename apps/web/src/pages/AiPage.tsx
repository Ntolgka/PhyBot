import type { ReactNode } from 'react';
import { useAiSettingsQuery, useAiStatusQuery } from '../features/ai/api';
import { useUiStore } from '../store/uiStore';
import { useGuildChannelsQuery } from '../features/guilds/api';
import { PageHeader } from '../components/layout/PageHeader';
import { ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { AiSettingsForm } from './ai/AiSettingsForm';
import { AiStatusPanel } from './ai/AiStatusPanel';
import { AiVoiceControlPanel } from './ai/AiVoiceControlPanel';
import { AiChatPanel } from './ai/AiChatPanel';
import { AiVoiceLog } from './ai/AiVoiceLog';

export function AiPage(): ReactNode {
  const guildId = useUiStore((state) => state.selectedGuildId);
  const settings = useAiSettingsQuery();
  const status = useAiStatusQuery();
  const channels = useGuildChannelsQuery(guildId);

  const isLoading = settings.isLoading || status.isLoading;
  const error = settings.error ?? status.error;

  return (
    <div>
      <PageHeader
        title="AI assistant"
        description="Configure and monitor the Turkish voice assistant."
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : error || !settings.data || !status.data ? (
        <ErrorState
          description={errorMessage(error)}
          onRetry={() => {
            settings.refetch();
            status.refetch();
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <AiSettingsForm key={JSON.stringify(settings.data)} initial={settings.data} />
            <AiChatPanel guildId={guildId} />
            <AiVoiceLog guildId={guildId} />
          </div>
          <div className="flex flex-col gap-6">
            <AiStatusPanel status={status.data} />
            {guildId && (
              <AiVoiceControlPanel
                guildId={guildId}
                channels={channels.data ?? []}
                status={status.data}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
