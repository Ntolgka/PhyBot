import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function InviteCard({ inviteUrl }: { inviteUrl: string }): ReactNode {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the URL is still selectable.
    }
  }

  return (
    <Card title="Invite link" description="Share this link to add the bot to another server.">
      <div className="flex gap-2">
        <Input
          readOnly
          value={inviteUrl}
          containerClassName="flex-1"
          aria-label="Invite URL"
          onFocus={(event) => event.target.select()}
        />
        <Button variant="outline" size="icon" aria-label="Copy invite link" onClick={handleCopy}>
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Open invite link"
          onClick={() => window.open(inviteUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
    </Card>
  );
}
