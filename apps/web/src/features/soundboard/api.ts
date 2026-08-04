import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Sound, SoundInput } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type SoundPatch = Partial<Omit<SoundInput, 'guildId'>>;

export function useSoundsQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.sounds(guildId),
    queryFn: () => api.get<Sound[]>(`/sounds?guildId=${guildId}`),
    enabled: guildId !== null,
  });
}

export function useCreateSoundMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SoundInput) => api.post<Sound>('/sounds', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sounds(guildId) });
    },
  });
}

export function useUpdateSoundMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SoundPatch }) =>
      api.patch<Sound>(`/sounds/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sounds(guildId) });
    },
  });
}

export function useDeleteSoundMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/sounds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sounds(guildId) });
    },
  });
}

export function usePlaySoundMutation(guildId: string) {
  return useMutation({
    mutationFn: (id: number) => api.post<{ ok: true }>(`/sounds/${id}/play`, { guildId }),
  });
}
