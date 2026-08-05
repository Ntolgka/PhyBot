import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Send } from 'lucide-react';
import type { FluxImage } from '@phybot/shared';
import { useAiChatMutation } from '../../features/ai/api';
import { fluxImageUrl } from '../../features/flux/api';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { cn } from '../../lib/cn';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Images the assistant drew for this reply, if any. */
  images?: FluxImage[];
}

let messageSeq = 0;

export function AiChatPanel({ guildId }: { guildId: string | null }): ReactNode {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const chatMutation = useAiChatMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: ++messageSeq, role: 'user', text }]);
    setInput('');
    chatMutation.mutate(
      { guildId: guildId ?? undefined, message: text },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: ++messageSeq,
              role: 'assistant',
              text: data.reply,
              ...(data.images.length > 0 ? { images: data.images } : {}),
            },
          ]);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            {
              id: ++messageSeq,
              role: 'assistant',
              text: error instanceof Error ? `Error: ${error.message}` : 'Something went wrong.',
            },
          ]);
        },
      },
    );
  }

  return (
    <Card
      title="Try the assistant"
      description="Send a text message the same way a chat command would."
      padded={false}
    >
      <div className="flex h-80 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Say hello to test the assistant's replies."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'ml-auto bg-accent-2/20 text-ink'
                      : 'bg-surface-2 text-ink',
                  )}
                >
                  {message.text}

                  {message.images && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {message.images.map((image) => (
                        <a
                          key={image.id}
                          href={fluxImageUrl(image.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring block overflow-hidden rounded-md border border-border"
                        >
                          <img
                            src={fluxImageUrl(image.id)}
                            alt={image.prompt}
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            containerClassName="flex-1"
            aria-label="Chat message"
            maxLength={2000}
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            aria-label="Send message"
            disabled={!input.trim()}
            pending={chatMutation.isPending}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
