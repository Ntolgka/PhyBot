import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventInput, GuildEvent } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type EventUpdate = Partial<Omit<EventInput, 'guildId'>>;

export function useEventsQuery(guildId: string | null, includePast: boolean) {
  return useQuery({
    queryKey: queryKeys.events(guildId, includePast),
    queryFn: () =>
      api.get<GuildEvent[]>(
        `/events?guildId=${guildId}&includePast=${includePast ? 'true' : 'false'}`,
      ),
    enabled: guildId !== null,
  });
}

export function useCreateEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EventInput) => api.post<GuildEvent>('/events', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUpdateEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: EventUpdate }) =>
      api.patch<GuildEvent>(`/events/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function usePublishEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<GuildEvent>(`/events/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useCancelEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<GuildEvent>(`/events/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
