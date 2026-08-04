import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type {
  ChannelSummary,
  RolePanel,
  RolePanelInput,
  RolePanelOption,
  RoleSummary,
} from '@phybot/shared';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Switch } from '../../components/ui/Switch';
import { Button } from '../../components/ui/Button';
import { ChannelSelect } from '../../components/common/ChannelSelect';
import { RoleSelect } from '../../components/common/RoleSelect';
import {
  useCreateRolePanelMutation,
  useUpdateRolePanelMutation,
} from '../../features/rolepanels/api';
import { useUiStore } from '../../store/uiStore';

const MAX_OPTIONS = 25;

function emptyOption(): RolePanelOption {
  return { roleId: '', label: '', description: '', emoji: null };
}

export function RolePanelEditorModal({
  guildId,
  channels,
  roles,
  panel,
  onClose,
}: {
  guildId: string;
  channels: ChannelSummary[];
  roles: RoleSummary[];
  panel: RolePanel | null;
  onClose: () => void;
}): ReactNode {
  const [title, setTitle] = useState(panel?.title ?? '');
  const [description, setDescription] = useState(panel?.description ?? '');
  const [channelId, setChannelId] = useState<string | null>(panel?.channelId ?? null);
  const [exclusive, setExclusive] = useState(panel?.exclusive ?? false);
  const [options, setOptions] = useState<RolePanelOption[]>(
    panel?.options.length ? panel.options : [emptyOption()],
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateRolePanelMutation(guildId);
  const updateMutation = useUpdateRolePanelMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);
  const pending = createMutation.isPending || updateMutation.isPending;

  function updateOption(index: number, patch: Partial<RolePanelOption>): void {
    setOptions((prev) => prev.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  }

  function removeOption(index: number): void {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!channelId) {
      setError('Choose a channel to publish this panel in.');
      return;
    }
    const cleanOptions = options
      .map((option) => ({
        ...option,
        label: option.label.trim(),
        description: option.description.trim(),
      }))
      .filter((option) => option.roleId && option.label);
    if (cleanOptions.length === 0) {
      setError('Add at least one option with a role and label.');
      return;
    }

    const onSuccess = (): void => {
      pushToast({
        level: 'success',
        message: panel ? 'Role panel updated.' : 'Role panel created.',
      });
      onClose();
    };
    const onError = (err: unknown): void => {
      setError(err instanceof Error ? err.message : 'Could not save the role panel.');
    };

    if (panel) {
      updateMutation.mutate(
        {
          id: panel.id,
          patch: {
            title: title.trim(),
            description: description.trim() || undefined,
            channelId,
            exclusive,
            options: cleanOptions,
          },
        },
        { onSuccess, onError },
      );
    } else {
      const input: RolePanelInput = {
        guildId,
        channelId,
        title: title.trim(),
        description: description.trim() || undefined,
        exclusive,
        options: cleanOptions,
      };
      createMutation.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={panel ? 'Edit role panel' : 'New role panel'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="role-panel-form" variant="primary" pending={pending}>
            {panel ? 'Save changes' : 'Create panel'}
          </Button>
        </>
      }
    >
      <form id="role-panel-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={2000}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChannelSelect
            label="Channel"
            channels={channels}
            types={['text', 'announcement']}
            value={channelId}
            onChange={setChannelId}
            allowNone={false}
          />
          <div className="flex items-end pb-2">
            <Switch
              checked={exclusive}
              onChange={setExclusive}
              label="Exclusive"
              description="Members may only hold one role from this panel."
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-ink-dim">
              Options ({options.length}/{MAX_OPTIONS})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leadingIcon={<Plus className="size-4" aria-hidden="true" />}
              disabled={options.length >= MAX_OPTIONS}
              onClick={() => setOptions((prev) => [...prev, emptyOption()])}
            >
              Add option
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {options.map((option, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_80px_auto]"
              >
                <RoleSelect
                  label="Role"
                  roles={roles}
                  value={option.roleId || null}
                  onChange={(value) => updateOption(index, { roleId: value ?? '' })}
                  allowNone={false}
                />
                <Input
                  label="Label"
                  value={option.label}
                  onChange={(e) => updateOption(index, { label: e.target.value })}
                  maxLength={80}
                />
                <Input
                  label="Emoji"
                  value={option.emoji ?? ''}
                  onChange={(e) => updateOption(index, { emoji: e.target.value || null })}
                  maxLength={64}
                />
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove option"
                    onClick={() => removeOption(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Input
                  label="Description"
                  containerClassName="sm:col-span-4"
                  value={option.description}
                  onChange={(e) => updateOption(index, { description: e.target.value })}
                  maxLength={100}
                />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
