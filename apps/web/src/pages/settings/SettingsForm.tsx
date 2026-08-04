import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ChannelSummary, GameStore, GuildSettings, RoleSummary } from '@phybot/shared';
import { GAME_STORES, MAX_VOLUME, MIN_VOLUME } from '@phybot/shared';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { Slider } from '../../components/ui/Slider';
import { Textarea } from '../../components/ui/Textarea';
import { Badge } from '../../components/ui/Badge';
import { ChannelSelect } from '../../components/common/ChannelSelect';
import { RoleSelect } from '../../components/common/RoleSelect';
import { SaveBar } from '../../components/common/SaveBar';
import { useUpdateGuildSettingsMutation } from '../../features/guilds/api';
import { useUiStore } from '../../store/uiStore';

type FormState = Omit<GuildSettings, 'guildId' | 'updatedAt' | 'freeGamesStores'> & {
  freeGamesStores: GameStore[];
};

function toFormState(settings: GuildSettings): FormState {
  const { guildId: _guildId, updatedAt: _updatedAt, freeGamesStores, ...rest } = settings;
  // The server only ever writes valid GameStore values into this array; the
  // shared GuildSettings type just keeps it loose as string[].
  return { ...rest, freeGamesStores: freeGamesStores as GameStore[] };
}

const GAME_STORE_LABEL: Record<GameStore, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  ubisoft: 'Ubisoft',
  itchio: 'itch.io',
  other: 'Other',
};

const TEXT_CHANNEL_TYPES: ChannelSummary['type'][] = ['text', 'announcement'];

export function SettingsForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: GuildSettings;
  channels: ChannelSummary[];
  roles: RoleSummary[];
}): ReactNode {
  const [savedSnapshot, setSavedSnapshot] = useState<FormState>(() => toFormState(initial));
  const [form, setForm] = useState<FormState>(savedSnapshot);
  const updateMutation = useUpdateGuildSettingsMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(): void {
    updateMutation.mutate(form, {
      onSuccess: (data) => {
        const snapshot = toFormState(data);
        setSavedSnapshot(snapshot);
        setForm(snapshot);
        pushToast({ level: 'success', message: 'Server settings saved.' });
      },
      onError: (error) => {
        pushToast({
          level: 'error',
          message: error instanceof Error ? error.message : 'Could not save settings.',
        });
      },
    });
  }

  function handleReset(): void {
    setForm(savedSnapshot);
  }

  function toggleStore(store: GameStore): void {
    const current = new Set(form.freeGamesStores);
    if (current.has(store)) current.delete(store);
    else current.add(store);
    set('freeGamesStores', Array.from(current));
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <Card title="General" description="Core behaviour for this server.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Text command prefix"
            value={form.prefix}
            maxLength={5}
            onChange={(event) => set('prefix', event.target.value)}
            hint={`Only for your own custom commands typed in chat, for example ${form.prefix || '!'}hello. Built-in commands such as /play are always slash commands.`}
          />
          <Select
            label="Locale"
            value={form.locale}
            onChange={(event) => set('locale', event.target.value as FormState['locale'])}
            options={[
              { value: 'en', label: 'English' },
              { value: 'tr', label: 'Türkçe' },
            ]}
          />
          <RoleSelect
            label="DJ role"
            hint="Members with this role bypass music permission checks."
            roles={roles}
            value={form.djRoleId}
            onChange={(value) => set('djRoleId', value)}
          />
        </div>
      </Card>

      <Card title="Auto-role" description="Automatically assign a role when someone joins.">
        <div className="flex flex-col gap-4">
          <Switch
            checked={form.autoRoleEnabled}
            onChange={(value) => set('autoRoleEnabled', value)}
            label="Enable auto-role"
            description="New members receive the selected role automatically."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleSelect
              label="Role for members"
              roles={roles}
              value={form.autoRoleId}
              onChange={(value) => set('autoRoleId', value)}
              disabled={!form.autoRoleEnabled}
            />
            <RoleSelect
              label="Role for bots"
              hint="Optional, applied to bot accounts instead."
              roles={roles}
              value={form.autoRoleBotId}
              onChange={(value) => set('autoRoleBotId', value)}
              disabled={!form.autoRoleEnabled}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Welcome & goodbye messages"
        description="Posted automatically in a channel when members join or leave."
      >
        <p className="mb-4 text-xs text-ink-faint">
          Use <Badge variant="neutral">{'{user}'}</Badge>{' '}
          <Badge variant="neutral">{'{server}'}</Badge>{' '}
          <Badge variant="neutral">{'{memberCount}'}</Badge> in your message and they will be
          replaced automatically.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Switch
              checked={form.welcomeEnabled}
              onChange={(value) => set('welcomeEnabled', value)}
              label="Welcome message"
            />
            <ChannelSelect
              label="Welcome channel"
              channels={channels}
              types={TEXT_CHANNEL_TYPES}
              value={form.welcomeChannelId}
              onChange={(value) => set('welcomeChannelId', value)}
              disabled={!form.welcomeEnabled}
            />
            <Textarea
              label="Welcome message"
              rows={3}
              value={form.welcomeMessage}
              onChange={(event) => set('welcomeMessage', event.target.value)}
              disabled={!form.welcomeEnabled}
              maxLength={1500}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Switch
              checked={form.goodbyeEnabled}
              onChange={(value) => set('goodbyeEnabled', value)}
              label="Goodbye message"
            />
            <ChannelSelect
              label="Goodbye channel"
              channels={channels}
              types={TEXT_CHANNEL_TYPES}
              value={form.goodbyeChannelId}
              onChange={(value) => set('goodbyeChannelId', value)}
              disabled={!form.goodbyeEnabled}
            />
            <Textarea
              label="Goodbye message"
              rows={3}
              value={form.goodbyeMessage}
              onChange={(event) => set('goodbyeMessage', event.target.value)}
              disabled={!form.goodbyeEnabled}
              maxLength={1500}
            />
          </div>
        </div>
      </Card>

      <Card title="Music" description="Defaults for the player in this server.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChannelSelect
            label="Music text channel"
            hint="Home of the live music panel: current track, queue and controls."
            channels={channels}
            types={TEXT_CHANNEL_TYPES}
            value={form.musicTextChannelId}
            onChange={(value) => set('musicTextChannelId', value)}
          />
          <div className="flex items-end pb-2">
            <Switch
              checked={form.announceNowPlaying}
              onChange={(value) => set('announceNowPlaying', value)}
              label="Keep the live music panel"
            />
          </div>
          <Slider
            label="Default volume"
            valueLabel={`${form.defaultVolume}%`}
            min={MIN_VOLUME}
            max={MAX_VOLUME}
            value={form.defaultVolume}
            onChange={(value) => set('defaultVolume', value)}
          />
          <Input
            type="number"
            label="Idle timeout (seconds)"
            min={0}
            max={3600}
            value={form.idleTimeoutSeconds}
            onChange={(event) => set('idleTimeoutSeconds', Number(event.target.value))}
            hint="Leaves voice after this many seconds alone. 0 disables it."
          />
        </div>
      </Card>

      <Card title="Events" description="Where event announcements and RSVP reminders are posted.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChannelSelect
            label="Events channel"
            channels={channels}
            types={TEXT_CHANNEL_TYPES}
            value={form.eventsChannelId}
            onChange={(value) => set('eventsChannelId', value)}
          />
          <Input
            type="number"
            label="Reminder minutes before start"
            min={0}
            max={10080}
            value={form.eventReminderMinutes}
            onChange={(event) => set('eventReminderMinutes', Number(event.target.value))}
            hint="0 disables reminders."
          />
        </div>
      </Card>

      <Card title="Free games" description="Announce free-game offers automatically.">
        <div className="flex flex-col gap-4">
          <Switch
            checked={form.freeGamesEnabled}
            onChange={(value) => set('freeGamesEnabled', value)}
            label="Enable free game announcements"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ChannelSelect
              label="Announcement channel"
              channels={channels}
              types={TEXT_CHANNEL_TYPES}
              value={form.freeGamesChannelId}
              onChange={(value) => set('freeGamesChannelId', value)}
              disabled={!form.freeGamesEnabled}
            />
            <RoleSelect
              label="Ping role"
              hint="Optional role mentioned in the announcement."
              roles={roles}
              value={form.freeGamesRoleId}
              onChange={(value) => set('freeGamesRoleId', value)}
              disabled={!form.freeGamesEnabled}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-dim">Stores to track</p>
            <div className="flex flex-wrap gap-2">
              {GAME_STORES.map((store) => {
                const active = form.freeGamesStores.includes(store);
                return (
                  <button
                    key={store}
                    type="button"
                    disabled={!form.freeGamesEnabled}
                    onClick={() => toggleStore(store)}
                    className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-accent-2/40 bg-accent-2/15 text-accent-3'
                        : 'border-border-strong text-ink-dim hover:bg-surface-2'
                    }`}
                  >
                    {GAME_STORE_LABEL[store]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card title="AI assistant" description="Enable the Turkish voice assistant for this server.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Switch
            checked={form.aiEnabled}
            onChange={(value) => set('aiEnabled', value)}
            label="Enable AI text replies"
          />
          <Switch
            checked={form.aiVoiceEnabled}
            onChange={(value) => set('aiVoiceEnabled', value)}
            label="Enable AI voice assistant"
            disabled={!form.aiEnabled}
          />
          <ChannelSelect
            label="AI text channel"
            channels={channels}
            types={TEXT_CHANNEL_TYPES}
            value={form.aiTextChannelId}
            onChange={(value) => set('aiTextChannelId', value)}
            disabled={!form.aiEnabled}
          />
        </div>
      </Card>

      <SaveBar
        visible={dirty}
        pending={updateMutation.isPending}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  );
}
