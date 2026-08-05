import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TtsCatalogVoice, TtsVoice, TtsVoiceInput } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type TtsVoiceUpdate = Partial<TtsVoiceInput>;

export interface SpeakParams {
  guildId: string;
  text: string;
  voiceChannelId?: string;
  voiceId?: number;
}

export function useTtsVoicesQuery() {
  return useQuery({
    queryKey: queryKeys.ttsVoices,
    queryFn: () => api.get<TtsVoice[]>('/tts/voices'),
  });
}

/** The provider catalogues rarely change, so this is cached for a while. */
export function useTtsCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.ttsCatalog,
    queryFn: () => api.get<TtsCatalogVoice[]>('/tts/catalog'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTtsVoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TtsVoiceInput) => api.post<TtsVoice>('/tts/voices', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsVoices });
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsCatalog });
    },
  });
}

export function useUpdateTtsVoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TtsVoiceUpdate }) =>
      api.patch<TtsVoice>(`/tts/voices/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsVoices });
    },
  });
}

export function useSetDefaultTtsVoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<TtsVoice>(`/tts/voices/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsVoices });
    },
  });
}

export function useDeleteTtsVoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/tts/voices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsVoices });
      queryClient.invalidateQueries({ queryKey: queryKeys.ttsCatalog });
    },
  });
}

export function useSpeakMutation() {
  return useMutation({
    mutationFn: (params: SpeakParams) => api.post<{ ok: true }>('/tts/speak', params),
  });
}
