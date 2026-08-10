import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BotProfile,
  BotProfilePatch,
  LogEntry,
  PresencePatch,
  PresenceSettings,
} from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export interface SendMessageParams {
  guildId: string;
  channelId: string;
  content: string;
}

export interface SentMessage {
  messageId: string;
  channelId: string;
  channelName: string;
}

export function useSendMessageMutation() {
  return useMutation({
    mutationFn: (params: SendMessageParams) => api.post<SentMessage>('/bot/message', params),
  });
}

export function useBotProfileQuery() {
  return useQuery({
    queryKey: queryKeys.botProfile,
    queryFn: () => api.get<BotProfile>('/bot/profile'),
  });
}

export function useUpdateBotProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: BotProfilePatch) => api.patch<BotProfile>('/bot/profile', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.botProfile, data);
    },
  });
}

export function useBotPresenceQuery() {
  return useQuery({
    queryKey: queryKeys.botPresence,
    queryFn: () => api.get<PresenceSettings>('/bot/presence'),
  });
}

export function useUpdatePresenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: PresencePatch) => api.patch<PresenceSettings>('/bot/presence', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.botPresence, data);
    },
  });
}

export function useBotLogsQuery(limit = 200) {
  return useQuery({
    queryKey: queryKeys.botLogs(limit),
    queryFn: () => api.get<LogEntry[]>(`/bot/logs?limit=${limit}`),
  });
}

export function useRedeployCommandsMutation() {
  return useMutation({
    mutationFn: () => api.post<{ ok: true; count: number }>('/bot/redeploy-commands'),
  });
}

export interface RestartResponse {
  ok: true;
  mode: 'supervised' | 'respawn';
  alreadyRequested: boolean;
  message: string;
}

export function useRestartBotMutation() {
  return useMutation({
    mutationFn: () => api.post<RestartResponse>('/bot/restart'),
  });
}
