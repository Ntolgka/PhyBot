import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ActivityType, PresenceSettings, PresenceStatus } from '@phybot/shared';
import { ACTIVITY_TYPES, PRESENCE_STATUSES } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Switch } from '../../components/ui/Switch';
import { SaveBar } from '../../components/common/SaveBar';
import { useUpdatePresenceMutation } from '../../features/bot/api';
import { useUiStore } from '../../store/uiStore';

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  invisible: 'Invisible',
};

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  playing: 'Playing',
  listening: 'Listening to',
  watching: 'Watching',
  competing: 'Competing in',
  custom: 'Custom status',
};

export function PresenceForm({ initial }: { initial: PresenceSettings }): ReactNode {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const updateMutation = useUpdatePresenceMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function handleSave(): void {
    updateMutation.mutate(form, {
      onSuccess: (data) => {
        setSaved(data);
        setForm(data);
        pushToast({ level: 'success', message: 'Presence updated.' });
      },
      onError: (error) => {
        pushToast({
          level: 'error',
          message: error instanceof Error ? error.message : 'Could not update presence.',
        });
      },
    });
  }

  return (
    <Card title="Presence" description="Status and activity shown under the bot's name.">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, status: e.target.value as PresenceStatus }))
            }
            options={PRESENCE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))}
          />
          <Select
            label="Activity type"
            value={form.activityType}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, activityType: e.target.value as ActivityType }))
            }
            options={ACTIVITY_TYPES.map((value) => ({ value, label: ACTIVITY_LABEL[value] }))}
          />
        </div>
        <Input
          label="Activity text"
          value={form.activityName}
          onChange={(e) => setForm((prev) => ({ ...prev, activityName: e.target.value }))}
          maxLength={128}
          disabled={form.showNowPlaying}
        />
        {form.activityType === 'watching' && (
          <Input
            label="Stream URL"
            value={form.activityUrl ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, activityUrl: e.target.value || null }))}
            placeholder="https://twitch.tv/..."
          />
        )}
        <Switch
          checked={form.showNowPlaying}
          onChange={(value) => setForm((prev) => ({ ...prev, showNowPlaying: value }))}
          label="Show now playing"
          description="Replace the activity text with the current track while music is playing."
        />
      </div>

      <SaveBar
        visible={dirty}
        pending={updateMutation.isPending}
        onSave={handleSave}
        onReset={() => setForm(saved)}
      />
    </Card>
  );
}
