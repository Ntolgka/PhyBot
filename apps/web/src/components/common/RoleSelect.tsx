import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RoleBlockReason, RoleSummary } from '@phybot/shared';
import { Select } from '../ui/Select';

export interface RoleSelectProps {
  label: string;
  hint?: string;
  roles: RoleSummary[];
  value: string | null;
  onChange: (roleId: string | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
}

const SUFFIXES: Record<RoleBlockReason, string> = {
  managed: 'managed by an integration',
  above_bot: 'above the bot',
  missing_permission: 'bot lacks Manage Roles',
};

const EXPLANATIONS: Record<RoleBlockReason, string> = {
  managed:
    'Discord never lets a bot hand out a role that belongs to an integration. Pick a role you created yourself.',
  above_bot:
    "This role sits above PhyBot in the role list. Open Server Settings, Roles in Discord and drag PhyBot's role above it.",
  missing_permission:
    'PhyBot does not have the Manage Roles permission in this server. Grant it in Server Settings, Roles.',
};

/**
 * Roles the bot cannot currently assign stay selectable (except integration
 * roles, which Discord never allows) so the setting can be configured before
 * the role hierarchy is fixed. The reason is always spelled out.
 */
export function RoleSelect({
  label,
  hint,
  roles,
  value,
  onChange,
  allowNone = true,
  disabled,
}: RoleSelectProps): ReactNode {
  const selected = roles.find((role) => role.id === value);
  const problem = selected?.blockedBy;
  const assignableCount = roles.filter((role) => role.assignable).length;
  const noneAssignable = roles.length > 0 && assignableCount === 0;

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        label={label}
        hint={hint}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        placeholder={allowNone ? 'None' : 'Select a role'}
        options={roles.map((role) => ({
          value: role.id,
          label: role.blockedBy ? `${role.name} (${SUFFIXES[role.blockedBy]})` : role.name,
          // Only integration roles are truly impossible to assign.
          disabled: role.blockedBy === 'managed',
        }))}
      />

      {problem !== undefined && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {EXPLANATIONS[problem]}
        </p>
      )}

      {problem === undefined && noneAssignable && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          PhyBot cannot assign any role yet. Move its role above the others in Discord under Server
          Settings, Roles, and make sure it has Manage Roles.
        </p>
      )}
    </div>
  );
}
