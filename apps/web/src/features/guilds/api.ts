import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelSummary,
  GuildSettings,
  GuildSettingsPatch,
  GuildSummary,
  RoleSummary,
} from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export function useGuildsQuery() {
  return useQuery({
    queryKey: queryKeys.guilds,
    queryFn: () => api.get<GuildSummary[]>('/guilds'),
    refetchInterval: 60_000,
  });
}

export function useGuildChannelsQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.guildChannels(guildId ?? ''),
    queryFn: () => api.get<ChannelSummary[]>(`/guilds/${guildId}/channels`),
    enabled: guildId !== null,
  });
}

export function useGuildRolesQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.guildRoles(guildId ?? ''),
    queryFn: () => api.get<RoleSummary[]>(`/guilds/${guildId}/roles`),
    enabled: guildId !== null,
  });
}

export function useGuildSettingsQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.guildSettings(guildId ?? ''),
    queryFn: () => api.get<GuildSettings>(`/guilds/${guildId}/settings`),
    enabled: guildId !== null,
  });
}

export function useUpdateGuildSettingsMutation(guildId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: GuildSettingsPatch) =>
      api.patch<GuildSettings>(`/guilds/${guildId}/settings`, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.guildSettings(guildId), data);
    },
  });
}
