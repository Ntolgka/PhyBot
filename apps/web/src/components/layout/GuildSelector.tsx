import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronsUpDown, Users } from 'lucide-react';
import { useGuildsQuery } from '../../features/guilds/api';
import { useUiStore } from '../../store/uiStore';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/Skeleton';

function GuildIcon({ name, iconUrl }: { name: string; iconUrl: string | null }): ReactNode {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="size-6 shrink-0 rounded-full" />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="accent-gradient flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
      {initial}
    </span>
  );
}

export function GuildSelector(): ReactNode {
  const { data: guilds, isLoading } = useGuildsQuery();
  const selectedGuildId = useUiStore((state) => state.selectedGuildId);
  const setSelectedGuildId = useUiStore((state) => state.setSelectedGuildId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false));

  useEffect(() => {
    if (!guilds || guilds.length === 0) return;
    const stillValid = guilds.some((guild) => guild.id === selectedGuildId);
    if (!stillValid) {
      setSelectedGuildId(guilds[0]?.id ?? null);
    }
  }, [guilds, selectedGuildId, setSelectedGuildId]);

  if (isLoading) {
    return <Skeleton className="h-10 w-56" />;
  }

  if (!guilds || guilds.length === 0) {
    return (
      <div className="flex h-10 items-center rounded-lg border border-dashed border-border-strong px-3 text-sm text-ink-faint">
        No servers available
      </div>
    );
  }

  const current = guilds.find((guild) => guild.id === selectedGuildId) ?? guilds[0] ?? null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="focus-ring flex h-10 w-56 items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 text-sm text-ink hover:bg-surface-3"
      >
        {current && <GuildIcon name={current.name} iconUrl={current.iconUrl} />}
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.name ?? 'Select a server'}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-border-strong bg-surface-2 p-1 shadow-2xl"
        >
          {guilds.map((guild) => (
            <li key={guild.id}>
              <button
                type="button"
                role="option"
                aria-selected={guild.id === selectedGuildId}
                onClick={() => {
                  setSelectedGuildId(guild.id);
                  setOpen(false);
                }}
                className={cn(
                  'focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-3',
                  guild.id === selectedGuildId ? 'bg-surface-3 text-ink' : 'text-ink-dim',
                )}
              >
                <GuildIcon name={guild.name} iconUrl={guild.iconUrl} />
                <span className="min-w-0 flex-1 truncate">{guild.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink-faint">
                  <Users className="size-3" aria-hidden="true" />
                  {guild.memberCount}
                </span>
                {guild.hasPlayer && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-success"
                    aria-label="Playing"
                    title="Playing"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
