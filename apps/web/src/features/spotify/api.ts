import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SpotifyConnection } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export function useSpotifyConnectionQuery() {
  return useQuery({
    queryKey: queryKeys.spotifyConnection,
    queryFn: () => api.get<SpotifyConnection>('/spotify/status'),
  });
}

/** Returns the Spotify consent URL the browser has to be sent to. */
export function useConnectSpotifyMutation() {
  return useMutation({
    mutationFn: () => api.post<{ url: string }>('/spotify/connect'),
  });
}

export function useDisconnectSpotifyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SpotifyConnection>('/spotify/disconnect'),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.spotifyConnection, data);
    },
  });
}
