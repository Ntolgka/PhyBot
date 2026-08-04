import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChannelSummary } from '@phybot/shared';
import { Select } from '../ui/Select';

export interface ChannelSelectProps {
  label: string;
  hint?: string;
  channels: ChannelSummary[];
  value: string | null;
  onChange: (channelId: string | null) => void;
  types?: ChannelSummary['type'][];
  allowNone?: boolean;
  disabled?: boolean;
}

/**
 * Channels the bot cannot use stay selectable, because channel permissions are
 * usually fixed in Discord straight after picking one here.
 */
export function ChannelSelect({
  label,
  hint,
  channels,
  value,
  onChange,
  types,
  allowNone = true,
  disabled,
}: ChannelSelectProps): ReactNode {
  const filtered = types ? channels.filter((channel) => types.includes(channel.type)) : channels;
  const selected = filtered.find((channel) => channel.id === value);

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        label={label}
        hint={hint}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        placeholder={allowNone ? 'None' : 'Select a channel'}
        options={filtered.map((channel) => {
          const name = channel.parentName
            ? `${channel.parentName} / ${channel.name}`
            : channel.name;
          return {
            value: channel.id,
            label: channel.usable ? name : `${name} (no access)`,
          };
        })}
      />

      {selected && !selected.usable && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          PhyBot cannot use this channel yet. Give its role access to the channel in Discord.
        </p>
      )}
    </div>
  );
}
