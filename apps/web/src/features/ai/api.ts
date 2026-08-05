import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiRuntimeStatus,
  AiSettings,
  AiSettingsPatch,
  AiVoiceEvent,
  FluxImage,
} from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

const AI_VOICE_EVENTS_KEY = ['ai', 'voiceEvents'] as const;

export interface AiVoiceOption {
  id: string;
  label: string;
}

export interface ChatParams {
  guildId?: string;
  message: string;
}

export interface ListenParams {
  guildId: string;
  voiceChannelId?: string;
  enabled: boolean;
}

export interface SpeakParams {
  guildId: string;
  text: string;
  voiceChannelId?: string;
}

export function useAiSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.aiSettings,
    queryFn: () => api.get<AiSettings>('/ai/settings'),
  });
}

export function useUpdateAiSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AiSettingsPatch) => api.patch<AiSettings>('/ai/settings', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.aiSettings, data);
    },
  });
}

export function useAiStatusQuery() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => api.get<AiRuntimeStatus>('/ai/status'),
    refetchInterval: 15_000,
  });
}

export function useAiVoicesQuery() {
  return useQuery({
    queryKey: queryKeys.aiVoices,
    queryFn: () => api.get<AiVoiceOption[]>('/ai/voices'),
    staleTime: Infinity,
  });
}

export function useAiChatMutation() {
  return useMutation({
    mutationFn: (params: ChatParams) =>
      api.post<{ reply: string; images: FluxImage[] }>('/ai/chat', params),
  });
}

export function useAiListenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ListenParams) => api.post<AiRuntimeStatus>('/ai/listen', params),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.aiStatus, data);
    },
  });
}

export function useAiSpeakMutation() {
  return useMutation({
    mutationFn: (params: SpeakParams) => api.post<{ ok: true }>('/ai/speak', params),
  });
}

/** Reads the rolling buffer of `ai:voice` websocket events populated by
 * useRealtime. Never fetches on its own — the cache is only ever written to
 * by the realtime layer. */
export function useAiVoiceEventsQuery() {
  return useQuery<AiVoiceEvent[]>({
    queryKey: AI_VOICE_EVENTS_KEY,
    queryFn: () => Promise.resolve([]),
    initialData: [],
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
