import type { ReactNode } from 'react';
import { Activity, Bot, Gauge, Gift, MemoryStick, Music2, Server, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOverviewQuery } from '../features/overview/api';
import { useBotLogsQuery } from '../features/bot/api';
import { SpotifyCard } from './overview/SpotifyCard';
import { RestartButton } from './overview/RestartButton';
import { PageHeader } from '../components/layout/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { LogLevelBadge } from '../components/common/LogLevelBadge';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton, SkeletonCard, SkeletonText } from '../components/ui/Skeleton';
import {
  formatDateTime,
  formatMemory,
  formatNumber,
  formatPing,
  formatUptime,
} from '../lib/format';

export function OverviewPage(): ReactNode {
  const overview = useOverviewQuery();
  const logs = useBotLogsQuery(8);

  if (overview.isLoading) {
    return (
      <div>
        <PageHeader
          title="Overview"
          description="Live status of your bot and servers."
          actions={<RestartButton />}
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <div>
        <PageHeader
          title="Overview"
          description="Live status of your bot and servers."
          actions={<RestartButton />}
        />
        <ErrorState
          description="Could not load the dashboard overview."
          onRetry={() => overview.refetch()}
        />
      </div>
    );
  }

  const { bot, players, ai, freeGames, guilds } = overview.data;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live status of your bot and servers."
        actions={<RestartButton />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Status"
          icon={Server}
          tone={bot.ready ? 'success' : 'danger'}
          value={bot.ready ? 'Online' : bot.online ? 'Connecting' : 'Offline'}
          hint={bot.version ? `v${bot.version}` : undefined}
        />
        <StatCard label="Ping" icon={Gauge} value={formatPing(bot.ping)} />
        <StatCard label="Uptime" icon={Activity} value={formatUptime(bot.uptimeSeconds)} />
        <StatCard
          label="Servers"
          icon={Users}
          value={formatNumber(bot.guildCount)}
          hint={`${formatNumber(bot.userCount)} members`}
        />
        <StatCard label="Memory" icon={MemoryStick} value={formatMemory(bot.memoryMb)} />
        <StatCard label="Active players" icon={Music2} value={formatNumber(bot.activePlayers)} />
        <StatCard
          label="AI assistant"
          icon={Bot}
          tone={ai.textReady ? 'success' : 'neutral'}
          value={ai.textReady ? 'Ready' : 'Not configured'}
          hint={
            ai.listeningGuilds.length > 0 ? `Listening in ${ai.listeningGuilds.length}` : undefined
          }
        />
        <StatCard
          label="Free game offers"
          icon={Gift}
          value={formatNumber(freeGames.offers.length)}
          hint={
            freeGames.lastCheckedAt
              ? `Checked ${formatDateTime(freeGames.lastCheckedAt)}`
              : undefined
          }
        />
      </div>

      {bot.lastError && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {bot.lastError}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Active players" description="Guilds currently connected to voice.">
          {players.length === 0 ? (
            <EmptyState
              icon={<Music2 className="size-8" />}
              title="No active players"
              description="Nothing is playing right now."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {players.map((player) => (
                <li key={player.guildId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{player.guildName}</p>
                    <p className="truncate text-xs text-ink-dim">
                      {player.current ? player.current.title : 'Idle'}
                      {player.voiceChannelName ? ` · ${player.voiceChannelName}` : ''}
                    </p>
                  </div>
                  <Badge variant={player.status === 'playing' ? 'success' : 'neutral'}>
                    {player.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Latest free games" description="Most recent offers detected by the tracker.">
          {freeGames.offers.length === 0 ? (
            <EmptyState
              icon={<Gift className="size-8" />}
              title="No offers found"
              description="Check back after the next refresh."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {freeGames.offers.slice(0, 5).map((offer) => (
                <li key={offer.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{offer.title}</p>
                    <p className="truncate text-xs text-ink-dim">{offer.store}</p>
                  </div>
                  {offer.keepForever && <Badge variant="accent">Keep forever</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SpotifyCard />

        <Card
          title="Your servers"
          description={`${guilds.length} server${guilds.length === 1 ? '' : 's'} connected.`}
        >
          {guilds.length === 0 ? (
            <EmptyState
              title="No servers"
              description="Invite the bot to a server to get started."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {guilds.slice(0, 6).map((guild) => (
                <li key={guild.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {guild.iconUrl ? (
                      <img src={guild.iconUrl} alt="" className="size-6 rounded-full" />
                    ) : (
                      <span className="accent-gradient flex size-6 items-center justify-center rounded-full text-xs font-semibold text-white">
                        {guild.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-sm text-ink">{guild.name}</span>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatNumber(guild.memberCount)} members
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/music"
            className="focus-ring mt-3 inline-block text-xs font-medium text-accent-3 hover:underline"
          >
            Manage music →
          </Link>
        </Card>

        <Card title="Recent activity" description="Latest console output.">
          {logs.isLoading ? (
            <SkeletonText lines={5} />
          ) : logs.isError || !logs.data ? (
            <ErrorState description="Could not load recent logs." onRetry={() => logs.refetch()} />
          ) : logs.data.length === 0 ? (
            <EmptyState title="No log entries yet" />
          ) : (
            <ul className="flex flex-col gap-2 font-mono text-xs">
              {logs.data
                .slice(-8)
                .reverse()
                .map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2">
                    <LogLevelBadge level={entry.level} />
                    <span className="min-w-0 flex-1 truncate text-ink-dim">{entry.message}</span>
                  </li>
                ))}
            </ul>
          )}
          <Link
            to="/logs"
            className="focus-ring mt-3 inline-block text-xs font-medium text-accent-3 hover:underline"
          >
            Open full console →
          </Link>
        </Card>
      </div>
    </div>
  );
}
