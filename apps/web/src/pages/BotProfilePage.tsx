import type { ReactNode } from 'react';
import { useBotPresenceQuery, useBotProfileQuery } from '../features/bot/api';
import { PageHeader } from '../components/layout/PageHeader';
import { ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { ProfileForm } from './profile/ProfileForm';
import { PresenceForm } from './profile/PresenceForm';
import { InviteCard } from './profile/InviteCard';

export function BotProfilePage(): ReactNode {
  const profile = useBotProfileQuery();
  const presence = useBotPresenceQuery();

  const isLoading = profile.isLoading || presence.isLoading;
  const error = profile.error ?? presence.error;

  return (
    <div>
      <PageHeader
        title="Bot profile"
        description="Manage how the bot presents itself on Discord."
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-48" />
        </div>
      ) : error || !profile.data || !presence.data ? (
        <ErrorState
          description={errorMessage(error)}
          onRetry={() => {
            profile.refetch();
            presence.refetch();
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ProfileForm key={profile.data.id} profile={profile.data} />
          <PresenceForm key={JSON.stringify(presence.data)} initial={presence.data} />
          <InviteCard inviteUrl={profile.data.inviteUrl} />
        </div>
      )}
    </div>
  );
}
