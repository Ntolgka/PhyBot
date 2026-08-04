import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import {
  useGuildChannelsQuery,
  useGuildRolesQuery,
  useGuildSettingsQuery,
  useGuildsQuery,
} from '../features/guilds/api';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { SettingsForm } from './settings/SettingsForm';

export function SettingsPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const settings = useGuildSettingsQuery(guildId);
  const channels = useGuildChannelsQuery(guildId);
  const roles = useGuildRolesQuery(guildId);

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader
          title="Server settings"
          description="Configure how the bot behaves in this server."
        />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader
          title="Server settings"
          description="Configure how the bot behaves in this server."
        />
        <EmptyState
          icon={<Settings2 className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </div>
    );
  }

  const isLoading = settings.isLoading || channels.isLoading || roles.isLoading;
  const error = settings.error ?? channels.error ?? roles.error;

  return (
    <div>
      <PageHeader
        title="Server settings"
        description="Configure how the bot behaves in this server."
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : error || !settings.data ? (
        <ErrorState
          description={errorMessage(error)}
          onRetry={() => {
            settings.refetch();
            channels.refetch();
            roles.refetch();
          }}
        />
      ) : (
        <SettingsForm
          key={guildId}
          guildId={guildId}
          initial={settings.data}
          channels={channels.data ?? []}
          roles={roles.data ?? []}
        />
      )}
    </div>
  );
}
