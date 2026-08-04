import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Sound } from '@phybot/shared';
import { Music, Plus } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useGuildsQuery } from '../features/guilds/api';
import { useDeleteSoundMutation, useSoundsQuery } from '../features/soundboard/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { SoundCard } from './soundboard/SoundCard';
import { SoundFormModal } from './soundboard/SoundFormModal';

export function SoundboardPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const sounds = useSoundsQuery(guildId);
  const deleteMutation = useDeleteSoundMutation(guildId);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState<Sound | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Sound | null>(null);

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader title="Soundboard" description="Upload short clips and play them in voice." />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader title="Soundboard" description="Upload short clips and play them in voice." />
        <EmptyState
          icon={<Music className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Soundboard"
        description="Upload short clips and play them in voice, like a soundpad."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            Add sound
          </Button>
        }
      />

      {sounds.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : sounds.isError ? (
        <ErrorState description={errorMessage(sounds.error)} onRetry={() => sounds.refetch()} />
      ) : !sounds.data || sounds.data.length === 0 ? (
        <EmptyState
          icon={<Music className="size-8" />}
          title="No soundboard clips yet"
          description="Upload a short clip to get started."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add sound
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sounds.data.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              guildId={guildId}
              onEdit={() => setEditing(sound)}
              onDelete={() => setDeleting(sound)}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <SoundFormModal
          guildId={guildId}
          sound={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete "${deleting.name}"?` : ''}
        description="This permanently removes the clip and its audio file."
        confirmLabel="Delete"
        danger
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
          });
        }}
      />
    </div>
  );
}
