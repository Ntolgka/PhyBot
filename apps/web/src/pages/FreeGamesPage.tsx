import type { ReactNode } from 'react';
import { CalendarClock, Gift, Infinity as InfinityIcon, Megaphone, RefreshCw } from 'lucide-react';
import {
  useAnnounceFreeGameMutation,
  useFreeGamesQuery,
  useRefreshFreeGamesMutation,
} from '../features/freegames/api';
import { useUiStore } from '../store/uiStore';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import type { FreeGameOffer } from '@phybot/shared';

const STORE_LABEL: Record<FreeGameOffer['store'], string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  ubisoft: 'Ubisoft',
  itchio: 'itch.io',
  other: 'Other',
};

function OfferCard({
  offer,
  guildId,
}: {
  offer: FreeGameOffer;
  guildId: string | null;
}): ReactNode {
  const announceMutation = useAnnounceFreeGameMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="aspect-video w-full bg-surface-3">
        {offer.imageUrl && (
          <img src={offer.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Badge variant="accent">{STORE_LABEL[offer.store]}</Badge>
          {offer.keepForever && (
            <Badge variant="success" icon={<InfinityIcon className="size-3" aria-hidden="true" />}>
              Keep forever
            </Badge>
          )}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold text-ink">{offer.title}</h3>
        <div className="mt-auto flex flex-col gap-1 text-xs text-ink-dim">
          {offer.originalPrice && <span>Normally {offer.originalPrice}</span>}
          {offer.endsAt && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Ends {formatDateTime(offer.endsAt)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(offer.url, '_blank', 'noopener,noreferrer')}
          >
            View offer
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Megaphone className="size-4" aria-hidden="true" />}
            disabled={!guildId}
            pending={announceMutation.isPending}
            onClick={() =>
              guildId &&
              announceMutation.mutate(
                { guildId, offerId: offer.id },
                {
                  onSuccess: () => pushToast({ level: 'success', message: 'Announcement posted.' }),
                  onError: (error) =>
                    pushToast({
                      level: 'error',
                      message: error instanceof Error ? error.message : 'Could not announce.',
                    }),
                },
              )
            }
          >
            Announce
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FreeGamesPage(): ReactNode {
  const freeGames = useFreeGamesQuery();
  const refreshMutation = useRefreshFreeGamesMutation();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <div>
      <PageHeader
        title="Free games"
        description="Currently tracked free-game offers across supported stores."
        actions={
          <Button
            variant="primary"
            leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}
            pending={refreshMutation.isPending}
            onClick={() =>
              refreshMutation.mutate(undefined, {
                onSuccess: () =>
                  pushToast({ level: 'success', message: 'Free game offers refreshed.' }),
                onError: (error) =>
                  pushToast({
                    level: 'error',
                    message: error instanceof Error ? error.message : 'Refresh failed.',
                  }),
              })
            }
          >
            Refresh
          </Button>
        }
      />

      {freeGames.data && (
        <p className="mb-4 text-xs text-ink-faint">
          {freeGames.data.lastCheckedAt
            ? `Last checked ${formatRelativeTime(freeGames.data.lastCheckedAt)}`
            : 'Not checked yet'}
          {freeGames.data.nextCheckAt
            ? ` · Next check ${formatRelativeTime(freeGames.data.nextCheckAt)}`
            : ''}
        </p>
      )}

      {freeGames.data?.lastError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {freeGames.data.lastError}
        </div>
      )}

      {freeGames.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : freeGames.isError ? (
        <ErrorState
          description={errorMessage(freeGames.error)}
          onRetry={() => freeGames.refetch()}
        />
      ) : !freeGames.data || freeGames.data.offers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gift className="size-8" />}
            title="No offers right now"
            description="Refresh to check the tracked stores again."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {freeGames.data.offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} guildId={guildId} />
          ))}
        </div>
      )}
    </div>
  );
}
