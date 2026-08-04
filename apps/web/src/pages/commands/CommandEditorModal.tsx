import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  CustomCommand,
  CustomCommandInput,
  CustomCommandType,
  RoleSummary,
} from '@phybot/shared';
import { CUSTOM_COMMAND_TYPES } from '@phybot/shared';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { RoleSelect } from '../../components/common/RoleSelect';
import { useCreateCommandMutation, useUpdateCommandMutation } from '../../features/commands/api';
import { useUiStore } from '../../store/uiStore';

const TYPE_LABEL: Record<CustomCommandType, string> = {
  text: 'Plain text',
  embed: 'Embed',
  random: 'Random from list',
};

const TYPE_HINT: Record<CustomCommandType, string> = {
  text: 'Sent as-is when the command runs.',
  embed: 'Content becomes the embed description.',
  random: 'One line is chosen at random each time.',
};

export function CommandEditorModal({
  guildId,
  roles,
  command,
  onClose,
}: {
  guildId: string;
  roles: RoleSummary[];
  command: CustomCommand | null;
  onClose: () => void;
}): ReactNode {
  const [name, setName] = useState(command?.name ?? '');
  const [description, setDescription] = useState(command?.description ?? '');
  const [type, setType] = useState<CustomCommandType>(command?.type ?? 'text');
  const [content, setContent] = useState(command?.content ?? '');
  const [embedTitle, setEmbedTitle] = useState(command?.embedTitle ?? '');
  const [embedColor, setEmbedColor] = useState(command?.embedColor ?? '#5865F2');
  const [embedImageUrl, setEmbedImageUrl] = useState(command?.embedImageUrl ?? '');
  const [requiredRoleId, setRequiredRoleId] = useState<string | null>(
    command?.requiredRoleId ?? null,
  );
  const [slash, setSlash] = useState(command?.slash ?? true);
  const [enabled, setEnabled] = useState(command?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateCommandMutation(guildId);
  const updateMutation = useUpdateCommandMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);
  const pending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!/^[a-z0-9_-]+$/.test(name)) {
      setError('Name must use only lowercase letters, numbers, dashes or underscores.');
      return;
    }
    if (!content.trim()) {
      setError('Content is required.');
      return;
    }

    const onSuccess = (): void => {
      pushToast({ level: 'success', message: command ? 'Command updated.' : 'Command created.' });
      onClose();
    };
    const onError = (err: unknown): void => {
      setError(err instanceof Error ? err.message : 'Could not save the command.');
    };

    if (command) {
      updateMutation.mutate(
        {
          id: command.id,
          patch: {
            name,
            description: description.trim() || undefined,
            type,
            content: content.trim(),
            embedTitle: type === 'embed' ? embedTitle.trim() || null : null,
            embedColor: type === 'embed' ? embedColor || null : null,
            embedImageUrl: type === 'embed' ? embedImageUrl.trim() || null : null,
            requiredRoleId,
            slash,
            enabled,
          },
        },
        { onSuccess, onError },
      );
    } else {
      const input: CustomCommandInput = {
        guildId,
        name,
        description: description.trim() || undefined,
        type,
        content: content.trim(),
        embedTitle: type === 'embed' ? embedTitle.trim() || null : null,
        embedColor: type === 'embed' ? embedColor || null : null,
        embedImageUrl: type === 'embed' ? embedImageUrl.trim() || null : null,
        requiredRoleId,
        slash,
        enabled,
      };
      createMutation.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={command ? 'Edit command' : 'New command'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="command-form" variant="primary" pending={pending}>
            {command ? 'Save changes' : 'Create command'}
          </Button>
        </>
      }
    >
      <form id="command-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            maxLength={32}
            required
            hint="Lowercase letters, numbers, dashes or underscores."
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as CustomCommandType)}
            options={CUSTOM_COMMAND_TYPES.map((value) => ({ value, label: TYPE_LABEL[value] }))}
            hint={TYPE_HINT[type]}
          />
        </div>
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={100}
        />
        <Textarea
          label={type === 'random' ? 'Content (one option per line)' : 'Content'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={4000}
          required
        />
        {type === 'embed' && (
          <div className="grid gap-4 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
            <Input
              label="Embed title"
              value={embedTitle}
              onChange={(e) => setEmbedTitle(e.target.value)}
              maxLength={256}
            />
            <Input
              type="color"
              label="Embed color"
              value={embedColor}
              onChange={(e) => setEmbedColor(e.target.value)}
              className="h-10 p-1"
            />
            <Input
              label="Embed image URL"
              value={embedImageUrl}
              onChange={(e) => setEmbedImageUrl(e.target.value)}
              containerClassName="sm:col-span-2"
              maxLength={500}
            />
          </div>
        )}
        <RoleSelect
          label="Required role"
          hint="Leave empty to allow everyone."
          roles={roles}
          value={requiredRoleId}
          onChange={setRequiredRoleId}
        />
        <div className="flex flex-wrap items-center gap-6">
          <Switch checked={slash} onChange={setSlash} label="Expose as slash command" />
          <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
        </div>
        <p className="text-xs text-ink-dim">
          With the switch on, the command appears in Discord as a slash command. With it off, it is
          only triggered by typing it in chat behind the server prefix from Server settings.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
