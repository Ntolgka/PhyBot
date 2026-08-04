import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NAV_ITEMS } from './navItems';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../../lib/cn';

function Logo({ compact }: { compact: boolean }): ReactNode {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="accent-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white">
        P
      </span>
      {!compact && <span className="text-sm font-semibold tracking-wide text-ink">PhyBot</span>}
    </div>
  );
}

function NavList({
  onNavigate,
  compact,
}: {
  onNavigate?: () => void;
  compact: boolean;
}): ReactNode {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'focus-ring group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
              isActive ? 'text-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="accent-gradient absolute inset-0 rounded-lg opacity-15"
                  aria-hidden="true"
                />
              )}
              {isActive && (
                <span
                  className="accent-gradient absolute inset-y-1 left-0 w-0.5 rounded-full"
                  aria-hidden="true"
                />
              )}
              <item.icon className="relative size-[18px] shrink-0" />
              {!compact && <span className="relative truncate">{item.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar(): ReactNode {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);

  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 md:flex',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Logo compact={collapsed} />
        </div>
        <NavList compact={collapsed} />
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg py-2 text-ink-faint hover:bg-surface-2 hover:text-ink"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col border-r border-border bg-surface">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Logo compact={false} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="focus-ring rounded-lg p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavList compact={false} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
