import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BuiltinCommandInfo, CustomCommand, CustomCommandInput } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export type CustomCommandUpdate = Partial<Omit<CustomCommandInput, 'guildId'>>;

export function useCommandsQuery(guildId: string | null) {
  return useQuery({
    queryKey: queryKeys.commands(guildId),
    queryFn: () => api.get<CustomCommand[]>(`/commands?guildId=${guildId}`),
    enabled: guildId !== null,
  });
}

export function useBuiltinCommandsQuery() {
  return useQuery({
    queryKey: queryKeys.builtinCommands,
    queryFn: () => api.get<BuiltinCommandInfo[]>('/commands/builtin'),
    staleTime: Infinity,
  });
}

export function useCreateCommandMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomCommandInput) => api.post<CustomCommand>('/commands', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commands(guildId) });
    },
  });
}

export function useUpdateCommandMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CustomCommandUpdate }) =>
      api.patch<CustomCommand>(`/commands/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commands(guildId) });
    },
  });
}

export function useDeleteCommandMutation(guildId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/commands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commands(guildId) });
    },
  });
}
