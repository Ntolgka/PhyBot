import type { RolePanelOption } from '@phybot/shared';

/**
 * Role ids that must be removed before granting `targetRoleId` on an
 * exclusive panel: every other role the member currently holds that also
 * belongs to this panel.
 */
export function exclusiveRolesToRemove(
  options: readonly RolePanelOption[],
  memberRoleIds: readonly string[],
  targetRoleId: string,
): string[] {
  const panelRoleIds = new Set(options.map((option) => option.roleId));
  return memberRoleIds.filter((id) => id !== targetRoleId && panelRoleIds.has(id));
}
