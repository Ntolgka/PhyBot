import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FreeGamesStatus } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export function useFreeGamesQuery() {
  return useQuery({
    queryKey: queryKeys.freeGames,
    queryFn: () => api.get<FreeGamesStatus>('/free-games'),
    refetchInterval: 60_000,
  });
}

export function useRefreshFreeGamesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<FreeGamesStatus>('/free-games/refresh'),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.freeGames, data);
    },
  });
}

export function useAnnounceFreeGameMutation() {
  return useMutation({
    mutationFn: (params: { guildId: string; offerId: string }) =>
      api.post<{ ok: true }>('/free-games/announce', params),
  });
}
