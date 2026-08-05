import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { MAX_FLUX_BATCH, MIN_FLUX_BATCH } from '@phybot/shared';
import { ImagePlus, Wand2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';
import { fluxImageUrl, useEditFluxMutation } from '../../features/flux/api';
import { useUiStore } from '../../store/uiStore';

const BATCH_SIZES = Array.from(
  { length: MAX_FLUX_BATCH - MIN_FLUX_BATCH + 1 },
  (_, index) => MIN_FLUX_BATCH + index,
);

/** Matches the server cap so an oversized file fails before it is uploaded. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read'));
    reader.readAsDataURL(file);
  });
}

export interface FluxEditDialogProps {
  /** Set when editing a picture that is already in the gallery. */
  imageId?: number;
  onClose: () => void;
}

/**
 * Takes a picture and an instruction and produces the changed version. The
 * source can be an upload or an image already in the gallery, which is what
 * makes a chain of edits possible.
 */
export function FluxEditDialog({ imageId, onClose }: FluxEditDialogProps): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(1);
  const [upload, setUpload] = useState<{ dataUrl: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const editMutation = useEditFluxMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const preview = imageId ? fluxImageUrl(imageId) : upload?.dataUrl;
  const canSubmit = Boolean(preview) && prompt.trim().length > 0 && !editMutation.isPending;

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      pushToast({ level: 'error', message: 'That image is larger than 12 MB.' });
      return;
    }
    try {
      setUpload({ dataUrl: await readAsDataUrl(file), name: file.name });
    } catch (error) {
      pushToast({ level: 'error', message: errorMessage(error) });
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    editMutation.mutate(
      {
        prompt: prompt.trim(),
        count,
        ...(imageId ? { imageId } : { image: upload?.dataUrl ?? '' }),
      },
      {
        onSuccess: () => {
          pushToast({ level: 'success', message: 'Edited. The new versions are in the gallery.' });
          onClose();
        },
        onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
      },
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-border bg-surface p-5"
      >
        <div>
          <h2 className="text-base font-semibold text-ink">Edit an image</h2>
          <p className="text-sm text-ink-dim">
            Describe the change. Everything the instruction does not mention stays as it is.
          </p>
        </div>

        {preview ? (
          <img
            src={preview}
            alt="The image being edited"
            className="max-h-56 w-full rounded-lg border border-border object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="focus-ring flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-sm text-ink-dim hover:text-ink"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            Choose an image
          </button>
        )}

        {!imageId && (
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        )}
        {!imageId && upload && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="focus-ring self-start text-xs text-ink-faint underline hover:text-ink-dim"
          >
            {upload.name} - choose a different one
          </button>
        )}

        <Textarea
          label="What should change"
          placeholder="Make the armor golden"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={1500}
          rows={3}
          disabled={editMutation.isPending}
          required
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-dim">Versions</span>
          <div className="inline-flex w-fit gap-1 rounded-lg border border-border-strong bg-surface-2 p-1">
            {BATCH_SIZES.map((value) => (
              <button
                key={value}
                type="button"
                disabled={editMutation.isPending}
                onClick={() => setCount(value)}
                aria-pressed={count === value}
                className={cn(
                  'focus-ring size-8 rounded-md text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                  count === value ? 'accent-gradient text-white' : 'text-ink-dim hover:text-ink',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            leadingIcon={<Wand2 className="size-4" aria-hidden="true" />}
            pending={editMutation.isPending}
            disabled={!canSubmit}
          >
            Edit
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
