import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useCreateTtsVoiceMutation } from '../../features/tts/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';
import { CommandVoiceFields } from './CommandVoiceFields';

/** Add-voice form for the `command` provider: a program that reads or clones speech locally. */
export function CustomVoiceForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [language, setLanguage] = useState('');
  const [gender, setGender] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [commandArgs, setCommandArgs] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateTtsVoiceMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!name.trim() || !voiceId.trim() || !command.trim()) {
      setError('Name, identifier and program path are required.');
      return;
    }

    createMutation.mutate(
      {
        name: name.trim(),
        provider: 'command',
        voiceId: voiceId.trim(),
        language: language.trim() || undefined,
        gender: gender.trim() || undefined,
        description: description.trim() || undefined,
        command: command.trim(),
        commandArgs: commandArgs.trim() || undefined,
      },
      {
        onSuccess: () => {
          pushToast({ level: 'success', message: `Added "${name.trim()}".` });
          onCreated();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
          placeholder="Cloned Emel"
        />
        <Input
          label="Identifier"
          value={voiceId}
          onChange={(event) => setVoiceId(event.target.value)}
          maxLength={120}
          required
          hint='A short unique label, e.g. "cloned-emel".'
          placeholder="cloned-emel"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          maxLength={20}
          placeholder="tr-TR"
        />
        <Input
          label="Gender"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          maxLength={20}
          placeholder="female"
        />
      </div>
      <Input
        label="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={200}
        placeholder="Optional"
      />

      <CommandVoiceFields
        command={command}
        commandArgs={commandArgs}
        onCommandChange={setCommand}
        onCommandArgsChange={setCommandArgs}
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          type="button"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button variant="primary" type="submit" pending={createMutation.isPending}>
          Add voice
        </Button>
      </div>
    </form>
  );
}
