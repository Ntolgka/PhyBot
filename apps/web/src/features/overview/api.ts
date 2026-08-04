import { useQuery } from '@tanstack/react-query';
import type { DashboardOverview } from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

export function useOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => api.get<DashboardOverview>('/overview'),
    refetchInterval: 30_000,
  });
}
