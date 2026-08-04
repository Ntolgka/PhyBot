import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ServerMessage } from '@phybot/shared';
import { realtimeClient, type RealtimeStatus } from '../lib/ws';
import { queryKeys } from '../lib/queryKeys';
import { useUiStore } from '../store/uiStore';

/** Opens the single shared realtime connection, wires incoming messages into
 * the TanStack Query cache and returns the current connection status. Mount
 * once near the root of the authenticated app. */
export function useRealtime(): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('closed');
  const pushToast = useUiStore((state) => state.pushToast);
  const appendLog = useUiStore((state) => state.appendLog);

  useEffect(() => {
    realtimeClient.start();
    const offStatus = realtimeClient.onStatus(setStatus);
    const offMessage = realtimeClient.onMessage((message: ServerMessage) => {
      switch (message.type) {
        case 'hello':
        case 'bot:status':
          queryClient.setQueryData(queryKeys.botStatus, message.data);
          queryClient.invalidateQueries({ queryKey: queryKeys.overview });
          break;
        case 'bot:profile':
          queryClient.setQueryData(queryKeys.botProfile, message.data);
          break;
        case 'player:update':
          queryClient.setQueryData(queryKeys.player(message.data.guildId), message.data);
          queryClient.invalidateQueries({ queryKey: queryKeys.overview });
          break;
        case 'player:removed':
          queryClient.setQueryData(queryKeys.player(message.data.guildId), null);
          queryClient.invalidateQueries({ queryKey: queryKeys.overview });
          break;
        case 'guilds:update':
          queryClient.setQueryData(queryKeys.guilds, message.data);
          break;
        case 'settings:update':
          queryClient.setQueryData(queryKeys.guildSettings(message.data.guildId), message.data);
          break;
        case 'event:update':
          queryClient.invalidateQueries({ queryKey: ['events'] });
          break;
        case 'event:removed':
          queryClient.invalidateQueries({ queryKey: ['events'] });
          break;
        case 'freegames:update':
          queryClient.setQueryData(queryKeys.freeGames, message.data);
          break;
        case 'ai:status':
          queryClient.setQueryData(queryKeys.aiStatus, message.data);
          break;
        case 'ai:settings':
          queryClient.setQueryData(queryKeys.aiSettings, message.data);
          break;
        case 'ai:voice':
          queryClient.setQueryData(['ai', 'voiceEvents'], (prev: unknown) => {
            const list = Array.isArray(prev) ? prev : [];
            return [message.data, ...list].slice(0, 50);
          });
          break;
        case 'log':
          appendLog(message.data);
          break;
        case 'notice':
          pushToast({
            level: message.data.level === 'warn' ? 'warning' : message.data.level,
            message: message.data.message,
          });
          break;
        case 'pong':
          break;
      }
    });

    return () => {
      offStatus();
      offMessage();
    };
  }, [queryClient, pushToast, appendLog]);

  return status;
}
