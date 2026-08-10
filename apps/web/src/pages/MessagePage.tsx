import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { ChannelSelect } from '../components/common/ChannelSelect';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Textarea } from '../components/ui/Textarea';
import { useGuildChannelsQuery } from '../features/guilds/api';
import { useSendMessageMutation } from '../features/bot/api';
import { errorMessage } from '../lib/api';
import { useUiStore } from '../store/uiStore';

/** Discord's own limit on a plain message. */
const MAX_LENGTH = 2000;

export function MessagePage(): ReactNode {
  const guildId = useUiStore((state) => state.selectedGuildId);
  const channels = useGuildChannelsQuery(guildId);
  const pushToast = useUiStore((state) => state.pushToast);

  const [channelId, setChannelId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const sendMutation = useSendMessageMutation();

  const trimmed = content.trim();
  const canSend =
    Boolean(guildId && channelId) && trimmed.length > 0 && content.length <= MAX_LENGTH;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!guildId || !channelId || !canSend) return;
    sendMutation.mutate(
      { guildId, channelId, content: trimmed },
      {
        onSuccess: (sent) => {
          pushToast({ level: 'success', message: `Sent to #${sent.channelName}.` });
          setContent('');
        },
        onError: (error) => pushToast({ level: 'error', message: errorMessage(error) }),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Send a message"
        description="Write anything and have the bot post it in a channel."
      />

      {!guildId ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="size-8" />}
            title="No server selected"
            description="Choose a server from the top bar."
          />
        </Card>
      ) : (
        <Card title="Message" description="Posted as the bot, exactly as written.">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <ChannelSelect
              label="Channel"
              channels={channels.data ?? []}
              value={channelId}
              onChange={setChannelId}
            />

            <Textarea
              label="Message"
              placeholder="Write the message the bot should post"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={6}
              disabled={sendMutation.isPending}
              required
            />

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-ink-faint">
                {content.length}/{MAX_LENGTH} characters. Markdown works; @everyone and role
                mentions are not pinged.
              </p>
              <Button
                type="submit"
                variant="primary"
                leadingIcon={<Send className="size-4" aria-hidden="true" />}
                pending={sendMutation.isPending}
                disabled={!canSend}
              >
                Send
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
