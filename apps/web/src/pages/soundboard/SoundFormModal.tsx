import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import type { Sound, SoundInput } from '@phybot/shared';
import { MAX_SOUND_DURATION_SECONDS, MAX_VOLUME, MIN_VOLUME } from '@phybot/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Slider } from '../../components/ui/Slider';
import { Switch } from '../../components/ui/Switch';
import { useCreateSoundMutation, useUpdateSoundMutation } from '../../features/soundboard/api';
import {
  readAudioDuration,
  readSoundFileAsDataUrl,
  validateSoundFile,
} from '../../features/soundboard/audio';
import { useUiStore } from '../../store/uiStore';

export function SoundFormModal({
  guildId,
  sound,
  onClose,
}: {
  guildId: string;
  sound: Sound | null;
  onClose: () => void;
}): ReactNode {
  const [name, setName] = useState(sound?.name ?? '');
  const [description, setDescription] = useState(sound?.description ?? '');
  const [emoji, setEmoji] = useState(sound?.emoji ?? '');
  const [volume, setVolume] = useState(sound?.volume ?? 100);
  const [slash, setSlash] = useState(sound?.slash ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateSoundMutation(guildId);
  const updateMutation = useUpdateSoundMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);
  const pending = createMutation.isPending || updateMutation.isPending;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const picked = event.target.files?.[0] ?? null;
    setFile(null);
    setFileDataUrl(null);
    setPreviewDuration(null);
    if (!picked) return;

    const validationError = validateSoundFile(picked);
    if (validationError) {
      setError(validationError);
      event.target.value = '';
      return;
    }

    setError(null);
    try {
      const [dataUrl, duration] = await Promise.all([
        readSoundFileAsDataUrl(picked),
        readAudioDuration(picked),
      ]);
      setFile(picked);
      setFileDataUrl(dataUrl);
      setPreviewDuration(duration);
    } catch {
      setError('Could not read the selected file.');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!/^[a-z0-9_-]+$/.test(name)) {
      setError('Name must use only lowercase letters, numbers, dashes or underscores.');
      return;
    }
    if (!sound && !fileDataUrl) {
      setError('Choose an audio file to upload.');
      return;
    }

    const onSuccess = (): void => {
      pushToast({ level: 'success', message: sound ? 'Sound updated.' : 'Sound created.' });
      onClose();
    };
    const onError = (err: unknown): void => {
      setError(err instanceof Error ? err.message : 'Could not save the sound.');
    };

    if (sound) {
      updateMutation.mutate(
        {
          id: sound.id,
          patch: {
            name,
            description: description.trim() || undefined,
            emoji: emoji.trim() || null,
            slash,
            volume,
            ...(fileDataUrl ? { file: fileDataUrl, originalName: file?.name } : {}),
          },
        },
        { onSuccess, onError },
      );
    } else {
      const input: SoundInput = {
        guildId,
        name,
        description: description.trim() || undefined,
        emoji: emoji.trim() || null,
        slash,
        volume,
        file: fileDataUrl ?? '',
        originalName: file?.name,
      };
      createMutation.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={sound ? 'Edit sound' : 'Add sound'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="sound-form" variant="primary" pending={pending}>
            {sound ? 'Save changes' : 'Create sound'}
          </Button>
        </>
      }
    >
      <form id="sound-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sound-file" className="text-sm font-medium text-ink-dim">
            {sound ? 'Replace audio (optional)' : 'Audio file'}
          </label>
          <input
            id="sound-file"
            type="file"
            accept="audio/*"
            onChange={(event) => void handleFileChange(event)}
            className="focus-ring text-sm text-ink-dim file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-3/80"
          />
          {file && (
            <p className="text-xs text-ink-faint">
              {file.name}
              {previewDuration !== null && ` — ${previewDuration.toFixed(1)}s`}
            </p>
          )}
          <p className="text-xs text-ink-faint">Up to {MAX_SOUND_DURATION_SECONDS} seconds.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            maxLength={32}
            required
            hint="Lowercase letters, numbers, dashes or underscores."
          />
          <Input
            label="Emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={64}
            placeholder="Optional"
          />
        </div>

        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={100}
        />

        <Slider
          label="Volume"
          valueLabel={`${volume}%`}
          value={volume}
          min={MIN_VOLUME}
          max={MAX_VOLUME}
          onChange={setVolume}
        />

        <Switch
          checked={slash}
          onChange={setSlash}
          label="Also register as its own slash command"
          description={`Lets members run /${name || 'name'} directly.`}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
