import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { BotProfile, BotProfilePatch } from '@phybot/shared';
import { TriangleAlert, X } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Badge } from '../../components/ui/Badge';
import { SaveBar } from '../../components/common/SaveBar';
import { ImageUploadField } from './ImageUploadField';
import { useUpdateBotProfileMutation } from '../../features/bot/api';
import { useUiStore } from '../../store/uiStore';

interface FormState {
  username: string;
  description: string;
  tags: string[];
  avatar: string | null | undefined;
  banner: string | null | undefined;
}

function initialForm(profile: BotProfile): FormState {
  return {
    username: profile.username,
    description: profile.description,
    tags: profile.tags,
    avatar: undefined,
    banner: undefined,
  };
}

const MAX_TAGS = 5;

export function ProfileForm({ profile }: { profile: BotProfile }): ReactNode {
  const [saved, setSaved] = useState(initialForm(profile));
  const [form, setForm] = useState(saved);
  const [tagInput, setTagInput] = useState('');
  const [currentProfile, setCurrentProfile] = useState(profile);
  const updateMutation = useUpdateBotProfileMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function addTag(): void {
    const tag = tagInput.trim();
    if (!tag || form.tags.length >= MAX_TAGS || form.tags.includes(tag)) return;
    setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput('');
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    }
  }

  function handleSave(): void {
    const patch: BotProfilePatch = {
      username: form.username,
      description: form.description,
      tags: form.tags,
      ...(form.avatar !== undefined ? { avatar: form.avatar } : {}),
      ...(form.banner !== undefined ? { banner: form.banner } : {}),
    };
    updateMutation.mutate(patch, {
      onSuccess: (data) => {
        setCurrentProfile(data);
        const snapshot = initialForm(data);
        setSaved(snapshot);
        setForm(snapshot);
        pushToast({ level: 'success', message: 'Bot profile updated.' });
      },
      onError: (error) => {
        pushToast({
          level: 'error',
          message: error instanceof Error ? error.message : 'Could not update the profile.',
        });
      },
    });
  }

  return (
    <Card title="Identity" description="How the bot appears across Discord.">
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Discord limits username changes to twice per hour. Avatar and banner changes are not
          affected.
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <Input
          label="Username"
          value={form.username}
          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          minLength={2}
          maxLength={32}
        />
        <Textarea
          label="Description"
          hint="Shown on the bot's application profile in Discord."
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
          maxLength={400}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-dim">Tags</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
                  }
                  className="focus-ring ml-0.5 rounded-full hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder={
              form.tags.length >= MAX_TAGS ? 'Maximum 5 tags' : 'Type a tag and press Enter'
            }
            maxLength={20}
            disabled={form.tags.length >= MAX_TAGS}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUploadField
            label="Avatar"
            hint="PNG, JPEG, GIF or WebP, up to 8 MB."
            shape="circle"
            currentUrl={currentProfile.avatarUrl}
            pendingValue={form.avatar}
            onChange={(value) => setForm((prev) => ({ ...prev, avatar: value }))}
          />
          <ImageUploadField
            label="Banner"
            hint="PNG, JPEG, GIF or WebP, up to 8 MB."
            shape="banner"
            currentUrl={currentProfile.bannerUrl}
            pendingValue={form.banner}
            onChange={(value) => setForm((prev) => ({ ...prev, banner: value }))}
          />
        </div>
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
