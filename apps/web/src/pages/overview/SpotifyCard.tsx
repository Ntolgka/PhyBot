import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link2, Link2Off, Music4 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useConnectSpotifyMutation,
  useDisconnectSpotifyMutation,
  useSpotifyConnectionQuery,
} from '../../features/spotify/api';
import { queryKeys } from '../../lib/queryKeys';
import { useUiStore } from '../../store/uiStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { formatDateTime } from '../../lib/format';

const RESULT_MESSAGES: Record<string, { level: 'success' | 'warning' | 'error'; message: string }> =
  {
    connected: {
      level: 'success',
      message: 'Spotify account linked. Full playlists are available now.',
    },
    denied: { level: 'warning', message: 'Spotify access was declined.' },
    invalid: {
      level: 'error',
      message: 'Spotify sent an incomplete answer. Try connecting again.',
    },
    failed: { level: 'error', message: 'Could not finish linking the Spotify account.' },
  };

/**
 * Links the owner's own Spotify account. Without it Spotify only shares the
 * first 100 tracks of a playlist through its public page.
 */
export function SpotifyCard(): ReactNode {
  const connection = useSpotifyConnectionQuery();
  const connect = useConnectSpotifyMutation();
  const disconnect = useDisconnectSpotifyMutation();
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const result = searchParams.get('spotify');
  useEffect(() => {
    if (!result) return;
    const toast = RESULT_MESSAGES[result];
    if (toast) pushToast(toast);
    void queryClient.invalidateQueries({ queryKey: queryKeys.spotifyConnection });
    searchParams.delete('spotify');
    setSearchParams(searchParams, { replace: true });
  }, [result, pushToast, queryClient, searchParams, setSearchParams]);

  const data = connection.data;
  if (!data) return null;

  const handleConnect = (): void => {
    connect.mutate(undefined, {
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
      onError: (error: Error) => {
        pushToast({ level: 'error', message: error.message });
      },
    });
  };

  return (
    <Card
      title="Spotify"
      description="Link your own account so playlists import completely."
      actions={
        data.connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="neutral">Not connected</Badge>
        )
      }
    >
      {data.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-dim">
            Linked as{' '}
            <span className="font-medium text-ink">{data.displayName ?? 'your account'}</span>
            {data.connectedAt !== null && <> since {formatDateTime(data.connectedAt)}</>}.
          </p>
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Link2Off className="size-4" />}
            pending={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-dim">
            Spotify no longer lets bots read playlists on their own, so playlists fall back to the
            public page and stop at 100 tracks. Connecting your account restores complete playlists
            and adds your private ones.
          </p>
          {data.configured ? (
            <>
              <p className="text-xs text-ink-dim">
                Add this redirect URI to your Spotify application first:{' '}
                <code className="rounded bg-surface-3 px-1.5 py-0.5 text-ink">
                  {data.redirectUri}
                </code>
              </p>
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Link2 className="size-4" />}
                pending={connect.isPending}
                onClick={handleConnect}
              >
                Connect Spotify
              </Button>
            </>
          ) : (
            <p className="text-xs text-warning">
              Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env, then restart the bot.
            </p>
          )}
        </div>
      )}

      {data.lastError !== null && (
        <p className="mt-3 flex items-start gap-2 text-xs text-danger">
          <Music4 className="mt-0.5 size-3.5 shrink-0" />
          {data.lastError}
        </p>
      )}
    </Card>
  );
}
