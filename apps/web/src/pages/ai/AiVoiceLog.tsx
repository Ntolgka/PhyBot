import type { ReactNode } from 'react';
import { useAiVoiceEventsQuery } from '../../features/ai/api';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatRelativeTime } from '../../lib/format';

export function AiVoiceLog({ guildId }: { guildId: string | null }): ReactNode {
  const { data: events } = useAiVoiceEventsQuery();
  const filtered = guildId ? events.filter((event) => event.guildId === guildId) : events;

  return (
    <Card
      title="Live voice activity"
      description="Transcripts and replies from the voice assistant, in real time."
    >
      {filtered.length === 0 ? (
        <EmptyState
          title="No voice activity yet"
          description="Say the wake word in a listening channel to see it here."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {filtered.map((event, index) => (
            <li
              key={`${event.at}-${index}`}
              className="border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
                <span>{event.userName}</span>
                <span>{formatRelativeTime(event.at)}</span>
              </div>
              <p className="text-sm text-ink-dim">
                <span className="font-medium text-ink">Heard:</span> {event.transcript}
              </p>
              <p className="mt-1 text-sm text-ink-dim">
                <span className="font-medium text-ink">Replied:</span> {event.reply}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
