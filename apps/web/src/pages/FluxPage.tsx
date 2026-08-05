import { useState } from 'react';
import type { ReactNode } from 'react';
import type { FluxImage } from '@phybot/shared';
import { Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { useUiStore } from '../store/uiStore';
import {
  useDeleteFluxImageMutation,
  useFluxConfigQuery,
  useFluxImagesQuery,
  useFluxRealtimeSync,
  useFluxStatusQuery,
} from '../features/flux/api';
import { FluxEditDialog } from './flux/FluxEditDialog';
import { FluxGallery } from './flux/FluxGallery';
import { FluxGenerateForm } from './flux/FluxGenerateForm';
import { FluxSettingsForm } from './flux/FluxSettingsForm';
import { FluxSetupNotice } from './flux/FluxSetupNotice';
import { FluxStatusPanel } from './flux/FluxStatusPanel';

export function FluxPage(): ReactNode {
  useFluxRealtimeSync();

  const status = useFluxStatusQuery();
  const config = useFluxConfigQuery();
  const images = useFluxImagesQuery();
  const deleteMutation = useDeleteFluxImageMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const [deleting, setDeleting] = useState<FluxImage | null>(null);
  // null means closed; a number edits that image, 0 opens the upload form.
  const [editing, setEditing] = useState<number | null>(null);

  const isLoading = status.isLoading || config.isLoading;
  const loadError = status.error ?? config.error;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Images" description="Generate images locally with FLUX." />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (loadError || !status.data || !config.data) {
    return (
      <div>
        <PageHeader title="Images" description="Generate images locally with FLUX." />
        <ErrorState
          description={errorMessage(loadError)}
          onRetry={() => {
            status.refetch();
            config.refetch();
          }}
        />
      </div>
    );
  }

  const ready = status.data.installed && status.data.modelsReady;

  return (
    <div>
      <PageHeader title="Images" description="Generate images locally with FLUX." />

      {!ready && <FluxSetupNotice status={status.data} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <FluxGenerateForm config={config.data} status={status.data} />

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Gallery</h2>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Pencil className="size-4" aria-hidden="true" />}
                disabled={!ready}
                onClick={() => setEditing(0)}
              >
                Edit an image
              </Button>
            </div>
            <FluxGallery
              images={images.data}
              isLoading={images.isLoading}
              isError={images.isError}
              errorDescription={errorMessage(images.error)}
              onRetry={() => images.refetch()}
              onDelete={(image) => setDeleting(image)}
              onEdit={(image) => setEditing(image.id)}
              upscaleModels={status.data.upscaleModels}
              defaultUpscaleModel={config.data.upscaleModel}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <FluxStatusPanel status={status.data} />
          <FluxSettingsForm
            key={JSON.stringify(config.data)}
            initial={config.data}
            upscaleModels={status.data.upscaleModels}
          />
        </div>
      </div>

      {editing !== null && (
        <FluxEditDialog
          {...(editing > 0 ? { imageId: editing } : {})}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? 'Delete this image?' : ''}
        description="This permanently removes the image and its upscaled copy, if any."
        confirmLabel="Delete"
        danger
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
          });
        }}
      />
    </div>
  );
}
