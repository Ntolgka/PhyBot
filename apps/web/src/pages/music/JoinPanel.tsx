import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChannelSummary } from '@phybot/shared';
import { PhoneCall, Radio } from 'lucide-react';
import { useJoinMutation } from '../../features/music/api';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function JoinPanel({
  guildId,
  channels,
}: {
  guildId: string;
  channels: ChannelSummary[];
}): ReactNode {
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const joinMutation = useJoinMutation(guildId);
  const voiceChannels = channels.filter(
    (channel) => channel.type === 'voice' || channel.type === 'stage',
  );

  useEffect(() => {
    if (voiceChannelId || voiceChannels.length === 0) return;
    const usable = voiceChannels.find((channel) => channel.usable) ?? voiceChannels[0];
    if (usable) setVoiceChannelId(usable.id);
  }, [voiceChannels, voiceChannelId]);

  return (
    <Card
      title="Not connected"
      description="Join a voice channel to start playing music, or search for a track below and it will join automatically."
    >
      {voiceChannels.length === 0 ? (
        <EmptyState
          icon={<Radio className="size-8" />}
          title="No voice channels found"
          description="The bot needs at least one usable voice or stage channel in this server."
        />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="Voice channel"
            containerClassName="flex-1"
            value={voiceChannelId}
            onChange={(event) => setVoiceChannelId(event.target.value)}
            options={voiceChannels.map((channel) => ({
              value: channel.id,
              label: channel.name,
              disabled: !channel.usable,
            }))}
            placeholder="Select a voice channel"
          />
          <Button
            variant="primary"
            disabled={!voiceChannelId}
            pending={joinMutation.isPending}
            leadingIcon={<PhoneCall className="size-4" aria-hidden="true" />}
            onClick={() => joinMutation.mutate({ voiceChannelId })}
          >
            Join
          </Button>
        </div>
      )}
    </Card>
  );
}
