import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ChannelSummary, TtsVoice } from '@phybot/shared';
import { Megaphone } from 'lucide-react';
import { ChannelSelect } from '../../components/common/ChannelSelect';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Textarea } from '../../components/ui/Textarea';
import { useSpeakMutation } from '../../features/tts/api';
import { errorMessage } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';

const MAX_TEXT_LENGTH = 1000;

const PROVIDER_LABEL: Record<TtsVoice['provider'], string> = {
  edge: 'Microsoft Edge',
  gemini: 'Gemini',
  command: 'Custom program',
};

export function SpeakPanel({
  guildId,
  channels,
  voices,
}: {
  guildId: string | null;
  channels: ChannelSummary[];
  voices: UseQueryResult<TtsVoice[], Error>;
}): ReactNode {
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);

  const speakMutation = useSpeakMutation();
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    if (voiceId || !voices.data) return;
    const defaultVoice = voices.data.find((voice) => voice.isDefault) ?? voices.data[0];
    if (defaultVoice) setVoiceId(String(defaultVoice.id));
  }, [voices.data, voiceId]);

  if (!guildId) {
    return (
      <Card>
        <EmptyState
          icon={<Megaphone className="size-8" />}
          title="No server selected"
          description="Choose a server from the top bar."
        />
      </Card>
    );
  }

  const trimmed = text.trim();
  const canSpeak = trimmed.length > 0 && text.length <= MAX_TEXT_LENGTH && voiceId !== '';

  function handleSpeak(): void {
    if (!guildId || !canSpeak) return;
    speakMutation.mutate(
      {
        guildId,
        text: trimmed,
        voiceChannelId: channelId ?? undefined,
        voiceId: voiceId ? Number(voiceId) : undefined,
      },
      {
        onSuccess: () => {
          pushToast({ level: 'success', message: 'Sent to the voice channel.' });
          setText('');
        },
        onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
      },
    );
  }

  return (
    <Card title="Speak" description="The bot reads your text out loud in the selected channel.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Textarea
            label="Text"
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT_LENGTH))}
            rows={5}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="Type what the bot should say..."
          />
          <p className="self-end text-xs text-ink-faint">
            {text.length} / {MAX_TEXT_LENGTH}
          </p>
        </div>

        {voices.isLoading ? (
          <Skeleton className="h-10" />
        ) : voices.isError ? (
          <ErrorState description={errorMessage(voices.error)} onRetry={() => voices.refetch()} />
        ) : !voices.data || voices.data.length === 0 ? (
          <EmptyState
            title="No voices configured"
            description="Add a voice below to enable speaking."
          />
        ) : (
          <Select
            label="Voice"
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            placeholder="Select a voice"
            options={voices.data.map((voice) => ({
              value: String(voice.id),
              label: `${voice.name} — ${voice.language || 'unspecified'} — ${PROVIDER_LABEL[voice.provider]}${voice.isDefault ? ' (default)' : ''}`,
              disabled: !voice.enabled,
            }))}
          />
        )}

        <ChannelSelect
          label="Voice channel"
          hint="Required unless the bot is already connected to a voice channel in this server."
          channels={channels}
          types={['voice']}
          value={channelId}
          onChange={setChannelId}
        />

        <Button
          variant="primary"
          leadingIcon={<Megaphone className="size-4" aria-hidden="true" />}
          disabled={!canSpeak}
          pending={speakMutation.isPending}
          onClick={handleSpeak}
        >
          Speak
        </Button>
      </div>
    </Card>
  );
}
