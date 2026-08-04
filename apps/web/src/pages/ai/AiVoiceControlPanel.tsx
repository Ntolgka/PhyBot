import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AiRuntimeStatus, ChannelSummary } from '@phybot/shared';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { useAiListenMutation, useAiSpeakMutation } from '../../features/ai/api';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useUiStore } from '../../store/uiStore';

export function AiVoiceControlPanel({
  guildId,
  channels,
  status,
}: {
  guildId: string;
  channels: ChannelSummary[];
  status: AiRuntimeStatus;
}): ReactNode {
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const [speakText, setSpeakText] = useState('');

  const listenMutation = useAiListenMutation();
  const speakMutation = useAiSpeakMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  const voiceChannels = channels.filter(
    (channel) => channel.type === 'voice' || channel.type === 'stage',
  );
  const isListening = status.listeningGuilds.includes(guildId);

  useEffect(() => {
    if (voiceChannelId || voiceChannels.length === 0) return;
    const usable = voiceChannels.find((channel) => channel.usable) ?? voiceChannels[0];
    if (usable) setVoiceChannelId(usable.id);
  }, [voiceChannels, voiceChannelId]);

  return (
    <Card
      title="Voice control"
      description="Start or stop the assistant listening in this server's voice channel."
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Voice channel"
          value={voiceChannelId}
          onChange={(e) => setVoiceChannelId(e.target.value)}
          options={voiceChannels.map((channel) => ({
            value: channel.id,
            label: channel.name,
            disabled: !channel.usable,
          }))}
          placeholder="Select a voice channel"
          disabled={isListening}
        />

        <Button
          variant={isListening ? 'danger' : 'primary'}
          leadingIcon={
            isListening ? (
              <MicOff className="size-4" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )
          }
          disabled={!isListening && !voiceChannelId}
          pending={listenMutation.isPending}
          onClick={() =>
            listenMutation.mutate(
              {
                guildId,
                voiceChannelId: isListening ? undefined : voiceChannelId,
                enabled: !isListening,
              },
              {
                onError: (error) =>
                  pushToast({
                    level: 'error',
                    message:
                      error instanceof Error ? error.message : 'Could not change listening state.',
                  }),
              },
            )
          }
        >
          {isListening ? 'Stop listening' : 'Start listening'}
        </Button>

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-ink-dim">Say something</p>
          <div className="flex gap-2">
            <Input
              value={speakText}
              onChange={(e) => setSpeakText(e.target.value)}
              placeholder="Text to speak in voice"
              maxLength={500}
              containerClassName="flex-1"
              aria-label="Text to speak"
            />
            <Button
              variant="secondary"
              leadingIcon={<Volume2 className="size-4" aria-hidden="true" />}
              disabled={!speakText.trim()}
              pending={speakMutation.isPending}
              onClick={() =>
                speakMutation.mutate(
                  { guildId, text: speakText.trim(), voiceChannelId: voiceChannelId || undefined },
                  {
                    onSuccess: () => setSpeakText(''),
                    onError: (error) =>
                      pushToast({
                        level: 'error',
                        message: error instanceof Error ? error.message : 'Could not speak.',
                      }),
                  },
                )
              }
            >
              Speak
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
