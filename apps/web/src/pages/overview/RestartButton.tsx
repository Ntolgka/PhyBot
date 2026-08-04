import { useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRestartBotMutation } from '../../features/bot/api';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { errorMessage } from '../../lib/api';

/**
 * Restarts the bot process, which is how configuration and code updates are
 * picked up. Playback stops, so it always asks first.
 */
export function RestartButton(): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const restart = useRestartBotMutation();
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();

  const handleRestart = (): void => {
    restart.mutate(undefined, {
      onSuccess: (data) => {
        setConfirming(false);
        pushToast({ level: 'success', message: data.message });
        // The bot is going away for a few seconds; refresh once it is back.
        window.setTimeout(() => {
          void queryClient.invalidateQueries();
        }, 8000);
      },
      onError: (error: Error) => {
        setConfirming(false);
        pushToast({ level: 'error', message: errorMessage(error) });
      },
    });
  };

  return (
    <>
      <Button
        variant="outline"
        leadingIcon={<RotateCw className="size-4" />}
        pending={restart.isPending}
        onClick={() => setConfirming(true)}
      >
        Restart bot
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Restart the bot?"
        description="Playback stops and the bot reconnects after a few seconds. Use this to apply an update or a change to the .env file."
        confirmLabel="Restart"
        pending={restart.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={handleRestart}
      />
    </>
  );
}
