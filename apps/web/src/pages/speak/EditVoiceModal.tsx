import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { TtsVoice } from '@phybot/shared';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useUpdateTtsVoiceMutation } from '../../features/tts/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';
import { CommandVoiceFields } from './CommandVoiceFields';

const PROVIDER_LABEL: Record<TtsVoice['provider'], string> = {
  edge: 'Microsoft Edge voice',
  gemini: 'Gemini voice',
  command: 'Custom program voice',
};

export function EditVoiceModal({
  voice,
  onClose,
}: {
  voice: TtsVoice;
  onClose: () => void;
}): ReactNode {
  const [name, setName] = useState(voice.name);
  const [voiceId, setVoiceId] = useState(voice.voiceId);
  const [language, setLanguage] = useState(voice.language);
  const [gender, setGender] = useState(voice.gender);
  const [description, setDescription] = useState(voice.description);
  const [command, setCommand] = useState(voice.command);
  const [commandArgs, setCommandArgs] = useState(voice.commandArgs);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateTtsVoiceMutation();
  const pushToast = useUiStore((state) => state.pushToast);
  const isCommand = voice.provider === 'command';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim() || !voiceId.trim()) {
      setError('Name and identifier are required.');
      return;
    }
    if (isCommand && !command.trim()) {
      setError('Program path is required.');
      return;
    }

    updateMutation.mutate(
      {
        id: voice.id,
        patch: {
          name: name.trim(),
          voiceId: voiceId.trim(),
          language: language.trim() || undefined,
          gender: gender.trim() || undefined,
          description: description.trim() || undefined,
          ...(isCommand
            ? { command: command.trim(), commandArgs: commandArgs.trim() || undefined }
            : {}),
        },
      },
      {
        onSuccess: () => {
          pushToast({ level: 'success', message: 'Voice updated.' });
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit voice"
      description={PROVIDER_LABEL[voice.provider]}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-voice-form"
            variant="primary"
            pending={updateMutation.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-voice-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
          />
          <Input
            label="Identifier"
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            maxLength={120}
            required
            hint={isCommand ? undefined : "The provider's own voice id."}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            maxLength={20}
          />
          <Input
            label="Gender"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            maxLength={20}
          />
        </div>
        <Input
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={200}
        />

        {isCommand && (
          <CommandVoiceFields
            command={command}
            commandArgs={commandArgs}
            onCommandChange={setCommand}
            onCommandArgsChange={setCommandArgs}
          />
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
