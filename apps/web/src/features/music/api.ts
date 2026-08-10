import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoopMode,
  PlayerSnapshot,
  PlayRequestInput,
  SearchResult,
  TrackLyrics,
} from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type {
  HistoryEntry,
  JoinParams,
  JumpParams,
  PlayResponse,
  QueueMoveParams,
  SeekParams,
  SeekRelativeParams,
  SkipParams,
  ToggleParams,
  TopTrack,
  VolumeParams,
} from './types';

export function usePlayerQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.player(guildId ?? ''),
    queryFn: () => api.get<PlayerSnapshot | null>(`/guilds/${guildId}/player`),
    enabled: guildId !== null,
    refetchInterval: 10_000,
  });
}

/**
 * Lyrics for the current track. Keyed by the track URL so switching songs
 * fetches once and going back to a played song is served from cache.
 */
export function useLyricsQuery(guildId: string | null, trackUrl: string | null) {
  return useQuery({
    queryKey: queryKeys.lyrics(guildId ?? '', trackUrl ?? ''),
    queryFn: () => api.get<TrackLyrics | null>(`/guilds/${guildId}/lyrics`),
    enabled: guildId !== null && trackUrl !== null,
    staleTime: Infinity,
    retry: false,
  });
}

export function useSearchQuery(query: string, limit = 20) {
  return useQuery({
    queryKey: queryKeys.search(query, limit),
    queryFn: () =>
      api.get<SearchResult[]>(`/music/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useHistoryQuery(guildId: string | null, limit = 50) {
  return useQuery({
    queryKey: queryKeys.history(guildId ?? '', limit),
    queryFn: () => api.get<HistoryEntry[]>(`/guilds/${guildId}/history?limit=${limit}`),
    enabled: guildId !== null,
  });
}

export function useTopTracksQuery(guildId: string | null, limit = 20) {
  return useQuery({
    queryKey: queryKeys.topTracks(guildId ?? '', limit),
    queryFn: () => api.get<TopTrack[]>(`/guilds/${guildId}/top-tracks?limit=${limit}`),
    enabled: guildId !== null,
  });
}

/** Shared plumbing for the player action endpoints: they all POST/DELETE to
 * `/guilds/:guildId/player/*` and return the fresh PlayerSnapshot, which we
 * write straight into the cache for instant feedback ahead of the
 * `player:update` websocket confirmation. */
function usePlayerMutation<TBody>(
  guildId: string,
  build: (body: TBody) => { path: string; method: 'POST' | 'DELETE' },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => {
      const { path, method } = build(body);
      return method === 'POST'
        ? api.post<PlayerSnapshot>(path, body)
        : api.delete<PlayerSnapshot>(path);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.player(guildId), data);
    },
  });
}

export function usePlayMutation(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlayRequestInput) =>
      api.post<PlayResponse>(`/guilds/${guildId}/player/play`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.player(guildId) });
    },
  });
}

export function useJoinMutation(guildId: string) {
  return usePlayerMutation<JoinParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/join`,
    method: 'POST',
  }));
}

export function useLeaveMutation(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/guilds/${guildId}/player/leave`),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.player(guildId), null);
    },
  });
}

export function usePauseMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/pause`,
    method: 'POST',
  }));
}

export function useResumeMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/resume`,
    method: 'POST',
  }));
}

export function useSkipMutation(guildId: string) {
  return usePlayerMutation<SkipParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/skip`,
    method: 'POST',
  }));
}

export function usePreviousMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/previous`,
    method: 'POST',
  }));
}

export function useRestartMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/restart`,
    method: 'POST',
  }));
}

export function useStopMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/stop`,
    method: 'POST',
  }));
}

export function useSeekMutation(guildId: string) {
  return usePlayerMutation<SeekParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/seek`,
    method: 'POST',
  }));
}

export function useSeekRelativeMutation(guildId: string) {
  return usePlayerMutation<SeekRelativeParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/seek-relative`,
    method: 'POST',
  }));
}

export function useVolumeMutation(guildId: string) {
  return usePlayerMutation<VolumeParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/volume`,
    method: 'POST',
  }));
}

export function useLoopMutation(guildId: string) {
  return usePlayerMutation<{ mode: LoopMode }>(guildId, () => ({
    path: `/guilds/${guildId}/player/loop`,
    method: 'POST',
  }));
}

export function useShuffleMutation(guildId: string) {
  return usePlayerMutation<ToggleParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/shuffle`,
    method: 'POST',
  }));
}

export function useShuffleQueueMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/shuffle-queue`,
    method: 'POST',
  }));
}

export function useAutoplayMutation(guildId: string) {
  return usePlayerMutation<ToggleParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/autoplay`,
    method: 'POST',
  }));
}

export function useJumpMutation(guildId: string) {
  return usePlayerMutation<JumpParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/jump`,
    method: 'POST',
  }));
}

export function useMoveMutation(guildId: string) {
  return usePlayerMutation<QueueMoveParams>(guildId, () => ({
    path: `/guilds/${guildId}/player/move`,
    method: 'POST',
  }));
}

export function useRemoveQueueItemMutation(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) =>
      api.delete<PlayerSnapshot>(`/guilds/${guildId}/player/queue/${trackId}`),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.player(guildId), data);
    },
  });
}

export function useClearQueueMutation(guildId: string) {
  return usePlayerMutation<void>(guildId, () => ({
    path: `/guilds/${guildId}/player/queue`,
    method: 'DELETE',
  }));
}
