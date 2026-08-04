import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RolePanel, RolePanelInput } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type RolePanelUpdate = Partial<Omit<RolePanelInput, 'guildId'>>;

export function useRolePanelsQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.rolePanels(guildId),
    queryFn: () => api.get<RolePanel[]>(`/role-panels?guildId=${guildId}`),
    enabled: guildId !== null,
  });
}

export function useCreateRolePanelMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RolePanelInput) => api.post<RolePanel>('/role-panels', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rolePanels(guildId) });
    },
  });
}

export function useUpdateRolePanelMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: RolePanelUpdate }) =>
      api.patch<RolePanel>(`/role-panels/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rolePanels(guildId) });
    },
  });
}

export function useDeleteRolePanelMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/role-panels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rolePanels(guildId) });
    },
  });
}

export function usePublishRolePanelMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<RolePanel>(`/role-panels/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rolePanels(guildId) });
    },
  });
}
