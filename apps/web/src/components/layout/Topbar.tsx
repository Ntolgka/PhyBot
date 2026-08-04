import type { ReactNode } from 'react';
import { LogOut, Menu, Wifi, WifiOff } from 'lucide-react';
import { GuildSelector } from './GuildSelector';
import { useUiStore } from '../../store/uiStore';
import { useLogoutMutation } from '../../features/auth/api';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import type { RealtimeStatus } from '../../lib/ws';
import { cn } from '../../lib/cn';

export function Topbar({ realtimeStatus }: { realtimeStatus: RealtimeStatus }): ReactNode {
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const logout = useLogoutMutation();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setMobileNavOpen(true)}
        className="focus-ring rounded-lg p-2 text-ink-dim hover:bg-surface-2 md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <GuildSelector />

      <div className="ml-auto flex items-center gap-3">
        <Tooltip content={realtimeStatus === 'open' ? 'Live connection active' : 'Reconnecting…'}>
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              realtimeStatus === 'open'
                ? 'border-success/30 text-success'
                : 'border-warning/30 text-warning',
            )}
          >
            {realtimeStatus === 'open' ? (
              <Wifi className="size-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="size-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {realtimeStatus === 'open' ? 'Live' : 'Reconnecting'}
            </span>
          </span>
        </Tooltip>

        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
          pending={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
