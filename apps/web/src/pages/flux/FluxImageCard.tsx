import { useState } from 'react';
import type { ReactNode } from 'react';
import type { FluxImage } from '@phybot/shared';
import { Download, Loader2, Maximize2, Save, Trash2, Wand2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatRelativeTime } from '../../lib/format';
import { errorMessage } from '../../lib/api';
import {
  fluxImageUrl,
  useSaveFluxImageMutation,
  useUpscaleFluxImageMutation,
} from '../../features/flux/api';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../../lib/cn';

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}): ReactNode {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="presentation"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="focus-ring absolute right-6 top-6 rounded-lg bg-surface-2/80 p-2 text-ink hover:bg-surface-2"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}

export function FluxImageCard({
  image,
  onDelete,
}: {
  image: FluxImage;
  onDelete: () => void;
}): ReactNode {
  const hasUpscaled = image.upscaledFileName !== null;
  const [variant, setVariant] = useState<'original' | 'upscaled'>('original');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const upscaleMutation = useUpscaleFluxImageMutation();
  const saveMutation = useSaveFluxImageMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const src = fluxImageUrl(image.id, variant);

  function handleUpscale(): void {
    upscaleMutation.mutate(image.id, {
      onSuccess: () => setVariant('upscaled'),
      onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
    });
  }

  function handleSave(): void {
    saveMutation.mutate(image.id, {
      onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
    });
  }

  function handleDownload(): void {
    const link = document.createElement('a');
    link.href = src;
    link.download = `flux-${image.id}${variant === 'upscaled' ? '-upscaled' : ''}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="focus-ring relative block aspect-square w-full overflow-hidden bg-surface-2"
        aria-label={`View ${image.prompt}`}
      >
        <img src={src} alt={image.prompt} className="size-full object-cover" loading="lazy" />
        <span className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="size-3.5 text-white" aria-hidden="true" />
        </span>
        <div className="absolute left-2 top-2 flex gap-1">
          {image.saved && <Badge variant="success">Saved</Badge>}
          {hasUpscaled && <Badge variant="accent">Upscaled</Badge>}
        </div>
      </button>

      {hasUpscaled && (
        <div className="flex border-b border-border text-xs">
          {(['original', 'upscaled'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setVariant(value)}
              className={cn(
                'focus-ring flex-1 py-1.5 font-medium capitalize transition-colors',
                variant === value ? 'bg-surface-3 text-ink' : 'text-ink-faint hover:text-ink-dim',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 px-3 py-2">
        <p className="line-clamp-2 text-xs text-ink-dim" title={image.prompt}>
          {image.prompt}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <span>
            {image.width}×{image.height}
          </span>
          <span aria-hidden="true">•</span>
          <span>seed {image.seed}</span>
          <span aria-hidden="true">•</span>
          <span>{formatRelativeTime(image.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={hasUpscaled ? 'Already upscaled' : 'Upscale'}
            title={hasUpscaled ? 'Already upscaled' : 'Upscale'}
            disabled={hasUpscaled || upscaleMutation.isPending}
            onClick={handleUpscale}
          >
            {upscaleMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={image.saved ? 'Already saved' : 'Save'}
            title={image.saved ? 'Already saved' : 'Save'}
            disabled={image.saved || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Download"
            title="Download"
            onClick={handleDownload}
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" aria-label="Delete" title="Delete" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {lightboxOpen && (
        <Lightbox src={src} alt={image.prompt} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}
