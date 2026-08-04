import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LogEntry } from '@phybot/shared';
import { Check, Copy, ScrollText } from 'lucide-react';
import { useBotLogsQuery } from '../features/bot/api';
import { useUiStore } from '../store/uiStore';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { LogLevelBadge } from '../components/common/LogLevelBadge';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';

const LEVEL_OPTIONS: { value: LogEntry['level'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'trace', label: 'Trace' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'fatal', label: 'Fatal' },
];

export function LogsPage(): ReactNode {
  const initialLogs = useBotLogsQuery(200);
  const logs = useUiStore((state) => state.logs);
  const seedLogs = useUiStore((state) => state.seedLogs);

  const [levelFilter, setLevelFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [textFilter, setTextFilter] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  // Seed the shared log buffer from history exactly once per mount, and only
  // if the realtime layer hasn't already accumulated live entries.
  useEffect(() => {
    if (seededRef.current || !initialLogs.data) return;
    seededRef.current = true;
    if (logs.length === 0) {
      seedLogs(initialLogs.data);
    }
  }, [initialLogs.data, logs.length, seedLogs]);

  const filtered = useMemo(() => {
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (
        textFilter &&
        !entry.message.toLowerCase().includes(textFilter.toLowerCase()) &&
        !entry.scope.toLowerCase().includes(textFilter.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [logs, levelFilter, textFilter]);

  useEffect(() => {
    if (autoscroll) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [filtered, autoscroll]);

  async function handleCopy(): Promise<void> {
    const text = filtered
      .map(
        (entry) =>
          `[${formatDateTime(entry.at)}] ${entry.level.toUpperCase()} (${entry.scope}) ${entry.message}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; nothing further to do.
    }
  }

  return (
    <div>
      <PageHeader title="Logs" description="Live console output streamed from the bot process." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Select
            label="Level"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogEntry['level'] | 'all')}
            options={LEVEL_OPTIONS}
            containerClassName="sm:w-44"
          />
          <Input
            label="Filter"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter by message or scope"
            containerClassName="flex-1"
          />
        </div>
        <div className="flex items-center gap-4 pb-0.5">
          <Switch checked={autoscroll} onChange={setAutoscroll} label="Autoscroll" />
          <Button
            variant="outline"
            size="sm"
            leadingIcon={
              copied ? (
                <Check className="size-4 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )
            }
            onClick={handleCopy}
            disabled={filtered.length === 0}
          >
            Copy
          </Button>
        </div>
      </div>

      {initialLogs.isLoading && logs.length === 0 ? (
        <Skeleton className="h-96" />
      ) : initialLogs.isError && logs.length === 0 ? (
        <ErrorState
          description={errorMessage(initialLogs.error)}
          onRetry={() => initialLogs.refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-8" />}
          title="No log entries"
          description="Nothing matches the current filters yet."
        />
      ) : (
        <div className="h-[65vh] overflow-y-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'flex gap-2 py-1',
                entry.level === 'error' || entry.level === 'fatal' ? 'text-danger' : 'text-ink-dim',
              )}
            >
              <span className="shrink-0 text-ink-faint">{formatDateTime(entry.at)}</span>
              <LogLevelBadge level={entry.level} />
              <span className="shrink-0 text-ink-faint">[{entry.scope}]</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {entry.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
