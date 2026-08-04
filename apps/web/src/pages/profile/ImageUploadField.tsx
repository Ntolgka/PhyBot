import { useId, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { readFileAsDataUrl, validateImageFile } from '../../lib/image';
import { cn } from '../../lib/cn';

export interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  currentUrl: string | null;
  /** undefined = unchanged (send nothing in the patch), null = explicitly
   * removed, string = a newly uploaded data URL. */
  pendingValue: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
  shape: 'circle' | 'banner';
}

export function ImageUploadField({
  label,
  hint,
  currentUrl,
  pendingValue,
  onChange,
  shape,
}: ImageUploadFieldProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const preview = pendingValue === undefined ? currentUrl : pendingValue;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
    } catch {
      setError('Could not read the selected file.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink-dim">{label}</p>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden bg-surface-3',
            shape === 'circle' ? 'size-20 rounded-full' : 'h-20 w-40 rounded-lg',
          )}
        >
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-ink-faint" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Upload
            </Button>
            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={<X className="size-3.5" aria-hidden="true" />}
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            )}
          </div>
          {hint && <p className="text-xs text-ink-faint">{hint}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={handleFileChange}
        aria-label={label}
      />
    </div>
  );
}
