import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  FluxConfig,
  FluxGenerationResult,
  FluxImage,
  FluxProgress,
  FluxStatus,
  ServerMessage,
} from '@phybot/shared';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { realtimeClient } from '../../lib/ws';

/** Broad prefix used to invalidate/update every cached image list regardless
 * of its limit/savedOnly parameters. */
const FLUX_IMAGES_PREFIX = ['flux', 'images'] as const;

export interface FluxGenerateParams {
  prompt: string;
  negativePrompt?: string;
  count?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

/** Builds the URL for an image's bytes, served through the authenticated API
 * so it works the same way as every other same-origin resource. */
export function fluxImageUrl(id: number, variant: 'original' | 'upscaled' = 'original'): string {
  return `/api/flux/images/${id}/file?variant=${variant}`;
}

export function useFluxStatusQuery() {
  return useQuery({
    queryKey: queryKeys.fluxStatus,
    queryFn: () => api.get<FluxStatus>('/flux/status'),
    refetchInterval: 15_000,
  });
}

export function useFluxConfigQuery() {
  return useQuery({
    queryKey: queryKeys.fluxConfig,
    queryFn: () => api.get<FluxConfig>('/flux/config'),
  });
}

export function useUpdateFluxConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<FluxConfig>) => api.patch<FluxConfig>('/flux/config', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.fluxConfig, data);
    },
  });
}

export function useFluxImagesQuery(limit = 60, savedOnly = false) {
  return useQuery({
    queryKey: queryKeys.fluxImages(limit, savedOnly),
    queryFn: () => api.get<FluxImage[]>(`/flux/images?limit=${limit}&savedOnly=${savedOnly}`),
  });
}

export function useGenerateFluxMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: FluxGenerateParams) =>
      api.post<FluxGenerationResult>('/flux/generate', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FLUX_IMAGES_PREFIX });
      queryClient.invalidateQueries({ queryKey: queryKeys.fluxStatus });
    },
  });
}

function patchCachedImage(
  queryClient: QueryClient,
  id: number,
  updater: (image: FluxImage) => FluxImage,
): void {
  queryClient.setQueriesData<FluxImage[]>({ queryKey: FLUX_IMAGES_PREFIX }, (prev) =>
    prev?.map((image) => (image.id === id ? updater(image) : image)),
  );
}

export function useUpscaleFluxImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<FluxImage>(`/flux/images/${id}/upscale`),
    onSuccess: (data) => patchCachedImage(queryClient, data.id, () => data),
  });
}

export function useSaveFluxImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<FluxImage>(`/flux/images/${id}/save`),
    onSuccess: (data) => patchCachedImage(queryClient, data.id, () => data),
  });
}

export function useDeleteFluxImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/flux/images/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueriesData<FluxImage[]>({ queryKey: FLUX_IMAGES_PREFIX }, (prev) =>
        prev?.filter((image) => image.id !== id),
      );
    },
  });
}

/** Reads the current generation progress, populated only by
 * {@link useFluxRealtimeSync}. Null when nothing is rendering. */
export function useFluxProgressQuery() {
  return useQuery<FluxProgress | null>({
    queryKey: queryKeys.fluxProgress,
    queryFn: () => Promise.resolve(null),
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * `useRealtime` (mounted once near the app root) does not know about the
 * flux:progress/flux:status messages, so this page-level hook subscribes to
 * the same shared websocket directly and mirrors them into the query cache.
 * Mount it once from FluxPage.
 */
export function useFluxRealtimeSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    return realtimeClient.onMessage((message: ServerMessage) => {
      if (message.type === 'flux:status') {
        queryClient.setQueryData(queryKeys.fluxStatus, message.data);
      } else if (message.type === 'flux:progress') {
        queryClient.setQueryData(queryKeys.fluxProgress, message.data);
      }
    });
  }, [queryClient]);
}

/** Clears the progress reading, for example once a generation settles. */
export function useClearFluxProgress(): () => void {
  const queryClient = useQueryClient();
  return () => queryClient.setQueryData(queryKeys.fluxProgress, null);
}
