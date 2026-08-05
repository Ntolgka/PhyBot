import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';

const ARGS_PLACEHOLDER = ['--voice', 'narrator', '--out', '{output}'].join('\n');

export interface CommandVoiceFieldsProps {
  command: string;
  commandArgs: string;
  onCommandChange: (value: string) => void;
  onCommandArgsChange: (value: string) => void;
}

/** Shared fields for the `command` provider, used by both the add and edit flows. */
export function CommandVoiceFields({
  command,
  commandArgs,
  onCommandChange,
  onCommandArgsChange,
}: CommandVoiceFieldsProps): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <p className="flex items-start gap-1.5 text-xs text-warning">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        This runs a program on the machine hosting the bot. Only point it at executables you trust.
      </p>
      <Input
        label="Program path"
        value={command}
        onChange={(event) => onCommandChange(event.target.value)}
        maxLength={500}
        required
        placeholder="C:\tools\my-tts\say.exe"
      />
      <Textarea
        label="Arguments (one per line)"
        value={commandArgs}
        onChange={(event) => onCommandArgsChange(event.target.value)}
        rows={4}
        maxLength={1000}
        placeholder={ARGS_PLACEHOLDER}
        hint="{output} is replaced with the file the program must write. Add {text} as its own line to pass the text as an argument; leave {text} out and the text is sent to standard input instead."
      />
    </div>
  );
}
