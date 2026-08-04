import { useState } from 'react';
import type { ReactNode } from 'react';
import type { RolePanel } from '@phybot/shared';
import { Pencil, Plus, Radio, Shapes, Trash2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useGuildsQuery, useGuildChannelsQuery, useGuildRolesQuery } from '../features/guilds/api';
import {
  useDeleteRolePanelMutation,
  usePublishRolePanelMutation,
  useRolePanelsQuery,
} from '../features/rolepanels/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { RolePanelEditorModal } from './rolepanels/RolePanelEditorModal';

function PanelCard({
  panel,
  onEdit,
  onDelete,
}: {
  panel: RolePanel;
  onEdit: () => void;
  onDelete: () => void;
}): ReactNode {
  const publishMutation = usePublishRolePanelMutation(panel.guildId);
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <Card
      title={panel.title}
      description={panel.description || undefined}
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Edit panel" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete panel" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {panel.exclusive && <Badge variant="accent">Exclusive</Badge>}
        {panel.messageId ? (
          <Badge variant="success">Published</Badge>
        ) : (
          <Badge variant="neutral">Draft</Badge>
        )}
        <span className="text-xs text-ink-faint">
          {panel.options.length} option{panel.options.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {panel.options.map((option) => (
          <span
            key={option.roleId}
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-2 px-2.5 py-1 text-xs text-ink-dim"
          >
            {option.emoji && <span>{option.emoji}</span>}
            {option.label}
          </span>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        leadingIcon={<Radio className="size-4" aria-hidden="true" />}
        pending={publishMutation.isPending}
        onClick={() =>
          publishMutation.mutate(panel.id, {
            onSuccess: () => pushToast({ level: 'success', message: 'Role panel published.' }),
            onError: (error) =>
              pushToast({
                level: 'error',
                message: error instanceof Error ? error.message : 'Could not publish panel.',
              }),
          })
        }
      >
        {panel.messageId ? 'Republish' : 'Publish'}
      </Button>
    </Card>
  );
}

export function RolePanelsPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const channels = useGuildChannelsQuery(guildId);
  const roles = useGuildRolesQuery(guildId);
  const panels = useRolePanelsQuery(guildId);
  const deleteMutation = useDeleteRolePanelMutation(guildId);

  const [editing, setEditing] = useState<RolePanel | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RolePanel | null>(null);

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader
          title="Role panels"
          description="Let members self-assign roles with button panels."
        />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader
          title="Role panels"
          description="Let members self-assign roles with button panels."
        />
        <EmptyState
          icon={<Shapes className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Role panels"
        description="Let members self-assign roles with button panels."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            New panel
          </Button>
        }
      />

      {panels.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : panels.isError ? (
        <ErrorState description={errorMessage(panels.error)} onRetry={() => panels.refetch()} />
      ) : !panels.data || panels.data.length === 0 ? (
        <EmptyState
          icon={<Shapes className="size-8" />}
          title="No role panels yet"
          description="Create one to let members pick their own roles."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {panels.data.map((panel) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              onEdit={() => setEditing(panel)}
              onDelete={() => setDeleting(panel)}
            />
          ))}
        </div>
      )}

      {editing && (
        <RolePanelEditorModal
          guildId={guildId}
          channels={channels.data ?? []}
          roles={roles.data ?? []}
          panel={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete "${deleting.title}"?` : ''}
        description="This permanently removes the panel. Any published message will stop working."
        confirmLabel="Delete"
        danger
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
