import { describe, expect, it } from 'vitest';
import type { RolePanelOption } from '@phybot/shared';
import { exclusiveRolesToRemove } from './logic.js';

function option(roleId: string, label = roleId): RolePanelOption {
  return { roleId, label, description: '', emoji: null };
}

describe('exclusiveRolesToRemove', () => {
  const panelOptions = [option('role-a'), option('role-b'), option('role-c')];

  it('returns other panel roles the member currently holds', () => {
    const result = exclusiveRolesToRemove(panelOptions, ['role-a', 'role-b', 'external'], 'role-c');
    expect(result.sort()).toEqual(['role-a', 'role-b']);
  });

  it('excludes the target role itself', () => {
    const result = exclusiveRolesToRemove(panelOptions, ['role-c'], 'role-c');
    expect(result).toEqual([]);
  });

  it('ignores roles outside the panel', () => {
    const result = exclusiveRolesToRemove(panelOptions, ['external-1', 'external-2'], 'role-a');
    expect(result).toEqual([]);
  });

  it('returns an empty list when the member holds no panel roles', () => {
    expect(exclusiveRolesToRemove(panelOptions, [], 'role-a')).toEqual([]);
  });
});
