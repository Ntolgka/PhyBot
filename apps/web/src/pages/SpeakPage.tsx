import type { ReactNode } from 'react';
import { useUiStore } from '../store/uiStore';
import { useGuildChannelsQuery } from '../features/guilds/api';
import { useTtsVoicesQuery } from '../features/tts/api';
import { PageHeader } from '../components/layout/PageHeader';
import { SpeakPanel } from './speak/SpeakPanel';
import { VoiceManagerCard } from './speak/VoiceManagerCard';

export function SpeakPage(): ReactNode {
  const guildId = useUiStore((state) => state.selectedGuildId);
  const channels = useGuildChannelsQuery(guildId);
  const voices = useTtsVoicesQuery();

  return (
    <div>
      <PageHeader
        title="Speak"
        description="Type something and have the bot read it out loud in a voice channel."
      />

      <div className="flex flex-col gap-6">
        <SpeakPanel guildId={guildId} channels={channels.data ?? []} voices={voices} />
        <VoiceManagerCard voices={voices} />
      </div>
    </div>
  );
}
