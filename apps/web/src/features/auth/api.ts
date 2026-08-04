import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, SessionInfo } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export function useSessionQuery() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.get<SessionInfo>('/auth/session'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionInfo>('/auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.session, data);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, {
        authenticated: false,
        expiresIn: 0,
      } satisfies SessionInfo);
    },
  });
}
