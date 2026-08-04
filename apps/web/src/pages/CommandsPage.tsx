import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomCommand } from '@phybot/shared';
import { Pencil, Plus, RefreshCcw, TerminalSquare, Trash2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useGuildsQuery, useGuildRolesQuery, useGuildSettingsQuery } from '../features/guilds/api';
import {
  useBuiltinCommandsQuery,
  useCommandsQuery,
  useDeleteCommandMutation,
} from '../features/commands/api';
import { useRedeployCommandsMutation } from '../features/bot/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';
import { errorMessage } from '../lib/api';
import { CommandEditorModal } from './commands/CommandEditorModal';

export function CommandsPage(): ReactNode {
  const guilds = useGuildsQuery();
  const guildId = useUiStore((state) => state.selectedGuildId);
  const roles = useGuildRolesQuery(guildId);
  const settings = useGuildSettingsQuery(guildId);
  // Message-only commands are typed with the server prefix, not as slash commands.
  const prefix = settings.data?.prefix ?? '!';
  const commands = useCommandsQuery(guildId);
  const builtin = useBuiltinCommandsQuery();
  const deleteMutation = useDeleteCommandMutation(guildId);
  const redeployMutation = useRedeployCommandsMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const [tab, setTab] = useState<'custom' | 'builtin'>('custom');
  const [editing, setEditing] = useState<CustomCommand | null | 'new'>(null);
  const [deleting, setDeleting] = useState<CustomCommand | null>(null);

  if (guilds.isLoading) {
    return (
      <div>
        <PageHeader
          title="Commands"
          description="Manage custom commands and review built-in ones."
        />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!guildId || guilds.data?.length === 0) {
    return (
      <div>
        <PageHeader
          title="Commands"
          description="Manage custom commands and review built-in ones."
        />
        <EmptyState
          icon={<TerminalSquare className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Commands"
        description="Manage custom commands and review built-in ones."
        actions={
          <>
            <Button
              variant="outline"
              leadingIcon={<RefreshCcw className="size-4" aria-hidden="true" />}
              pending={redeployMutation.isPending}
              onClick={() =>
                redeployMutation.mutate(undefined, {
                  onSuccess: (data) =>
                    pushToast({
                      level: 'success',
                      message: `Redeployed ${data.count} slash command${data.count === 1 ? '' : 's'}.`,
                    }),
                  onError: (error) =>
                    pushToast({
                      level: 'error',
                      message: error instanceof Error ? error.message : 'Redeploy failed.',
                    }),
                })
              }
            >
              Redeploy slash commands
            </Button>
            <Button
              variant="primary"
              leadingIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setEditing('new')}
            >
              New command
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as 'custom' | 'builtin')}
        items={[
          { value: 'custom', label: 'Custom commands' },
          { value: 'builtin', label: 'Built-in commands' },
        ]}
        className="mb-4"
      />

      {tab === 'custom' ? (
        <Card padded={false}>
          {commands.isLoading ? (
            <div className="p-5">
              <SkeletonText lines={5} />
            </div>
          ) : commands.isError ? (
            <div className="p-5">
              <ErrorState
                description={errorMessage(commands.error)}
                onRetry={() => commands.refetch()}
              />
            </div>
          ) : !commands.data || commands.data.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<TerminalSquare className="size-8" />}
                title="No custom commands yet"
                description="Create one to get started."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Uses</th>
                    <th className="px-5 py-3 font-medium">Slash</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commands.data.map((command) => (
                    <tr key={command.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">
                          {command.slash ? '/' : prefix}
                          {command.name}
                        </p>
                        {command.description && (
                          <p className="text-xs text-ink-dim">{command.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 capitalize text-ink-dim">{command.type}</td>
                      <td className="px-5 py-3 tabular-nums text-ink-dim">{command.uses}</td>
                      <td className="px-5 py-3">
                        {command.slash ? (
                          <Badge variant="accent">Slash</Badge>
                        ) : (
                          <Badge variant="neutral">
                            Typed as {prefix}
                            {command.name}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {command.enabled ? (
                          <Badge variant="success">Enabled</Badge>
                        ) : (
                          <Badge variant="neutral">Disabled</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${command.name}`}
                            onClick={() => setEditing(command)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${command.name}`}
                            onClick={() => setDeleting(command)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {builtin.isLoading ? (
            <div className="p-5">
              <SkeletonText lines={5} />
            </div>
          ) : builtin.isError ? (
            <div className="p-5">
              <ErrorState
                description={errorMessage(builtin.error)}
                onRetry={() => builtin.refetch()}
              />
            </div>
          ) : !builtin.data || builtin.data.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No built-in commands reported" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Command</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Usage</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {builtin.data.map((command) => (
                    <tr key={command.name}>
                      <td className="px-5 py-3 font-medium text-ink">/{command.name}</td>
                      <td className="px-5 py-3 text-ink-dim">{command.category}</td>
                      <td className="px-5 py-3 font-mono text-xs text-ink-dim">{command.usage}</td>
                      <td className="px-5 py-3 text-ink-dim">{command.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing !== null && (
        <CommandEditorModal
          guildId={guildId}
          roles={roles.data ?? []}
          command={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete /${deleting.name}?` : ''}
        description="This permanently removes the custom command."
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
