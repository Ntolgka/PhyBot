import { useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TtsVoice } from '@phybot/shared';
import { Mic, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import {
  useDeleteTtsVoiceMutation,
  useSetDefaultTtsVoiceMutation,
  useUpdateTtsVoiceMutation,
} from '../../features/tts/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';
import { AddVoiceModal } from './AddVoiceModal';
import { EditVoiceModal } from './EditVoiceModal';

const PROVIDER_LABEL: Record<TtsVoice['provider'], string> = {
  edge: 'Microsoft Edge',
  gemini: 'Gemini',
  command: 'Custom program',
};

const PROVIDER_BADGE: Record<TtsVoice['provider'], 'info' | 'accent' | 'warning'> = {
  edge: 'info',
  gemini: 'accent',
  command: 'warning',
};

export function VoiceManagerCard({
  voices,
}: {
  voices: UseQueryResult<TtsVoice[], Error>;
}): ReactNode {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TtsVoice | null>(null);
  const [deleting, setDeleting] = useState<TtsVoice | null>(null);

  const updateMutation = useUpdateTtsVoiceMutation();
  const setDefaultMutation = useSetDefaultTtsVoiceMutation();
  const deleteMutation = useDeleteTtsVoiceMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  function handleToggleEnabled(voice: TtsVoice, enabled: boolean): void {
    updateMutation.mutate(
      { id: voice.id, patch: { enabled } },
      { onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }) },
    );
  }

  function handleSetDefault(voice: TtsVoice): void {
    setDefaultMutation.mutate(voice.id, {
      onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
    });
  }

  return (
    <Card
      title="Voice library"
      description="Voices available to the Speak panel and the AI assistant."
      actions={
        <Button
          variant="primary"
          leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() => setAdding(true)}
        >
          Add voice
        </Button>
      }
      padded={false}
    >
      {voices.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : voices.isError ? (
        <div className="p-5">
          <ErrorState description={errorMessage(voices.error)} onRetry={() => voices.refetch()} />
        </div>
      ) : !voices.data || voices.data.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<Mic className="size-8" />}
            title="No voices yet"
            description="Add one from a provider catalogue or point at a custom program."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add voice
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-5 py-3 font-medium">Voice</th>
                <th className="px-5 py-3 font-medium">Provider</th>
                <th className="px-5 py-3 font-medium">Language</th>
                <th className="px-5 py-3 font-medium">Gender</th>
                <th className="px-5 py-3 font-medium">Enabled</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {voices.data.map((voice) => {
                const togglingThis =
                  updateMutation.isPending && updateMutation.variables?.id === voice.id;
                const settingDefaultThis =
                  setDefaultMutation.isPending && setDefaultMutation.variables === voice.id;
                return (
                  <tr key={voice.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink">{voice.name}</p>
                        {voice.isDefault && <Badge variant="success">Default</Badge>}
                      </div>
                      {voice.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-ink-dim">
                          {voice.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={PROVIDER_BADGE[voice.provider]}>
                        {PROVIDER_LABEL[voice.provider]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-ink-dim">{voice.language || '—'}</td>
                    <td className="px-5 py-3 text-ink-dim">{voice.gender || '—'}</td>
                    <td className="px-5 py-3">
                      <Switch
                        checked={voice.enabled}
                        disabled={togglingThis}
                        onChange={(checked) => handleToggleEnabled(voice, checked)}
                        label={
                          <span className="sr-only">
                            {voice.enabled ? 'Disable' : 'Enable'} {voice.name}
                          </span>
                        }
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {!voice.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            pending={settingDefaultThis}
                            onClick={() => handleSetDefault(voice)}
                          >
                            Set default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${voice.name}`}
                          onClick={() => setEditing(voice)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${voice.name}`}
                          onClick={() => setDeleting(voice)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddVoiceModal onClose={() => setAdding(false)} />}
      {editing && <EditVoiceModal voice={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete "${deleting.name}"?` : ''}
        description="This removes the voice from the registry. It cannot be undone."
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
    </Card>
  );
}
