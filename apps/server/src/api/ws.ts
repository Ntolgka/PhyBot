import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { WS_PATH, type ClientMessage, type ServerMessage } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { logBuffer } from '../core/logger.js';
import { getStatus } from '../discord/client.js';
import { readSession } from './auth.js';

const log = createLogger('websocket');

const clients = new Set<WebSocket>();

function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const socket of clients) {
    if (socket.readyState !== socket.OPEN) continue;
    try {
      socket.send(payload);
    } catch (error) {
      log.debug({ err: error }, 'Dropping a websocket message');
    }
  }
}

/** Bridges the internal event bus to every connected dashboard. */
function subscribeBus(): void {
  bus.on('bot:status', (data) => broadcast({ type: 'bot:status', data }));
  bus.on('bot:profile', (data) => broadcast({ type: 'bot:profile', data }));
  bus.on('player:update', (data) => broadcast({ type: 'player:update', data }));
  bus.on('player:removed', (data) => broadcast({ type: 'player:removed', data }));
  bus.on('guilds:update', (data) => broadcast({ type: 'guilds:update', data }));
  bus.on('settings:update', (data) => broadcast({ type: 'settings:update', data }));
  bus.on('event:update', (data) => broadcast({ type: 'event:update', data }));
  bus.on('event:removed', (data) => broadcast({ type: 'event:removed', data }));
  bus.on('freegames:update', (data) => broadcast({ type: 'freegames:update', data }));
  bus.on('ai:status', (data) => broadcast({ type: 'ai:status', data }));
  bus.on('ai:settings', (data) => broadcast({ type: 'ai:settings', data }));
  bus.on('ai:voice', (data) => broadcast({ type: 'ai:voice', data }));
  bus.on('notice', (data) => broadcast({ type: 'notice', data }));
  logBuffer.on('entry', (entry) => broadcast({ type: 'log', data: entry }));
}

let subscribed = false;

export function registerWebsocket(app: FastifyInstance): void {
  if (!subscribed) {
    subscribeBus();
    subscribed = true;
  }

  app.get(WS_PATH, { websocket: true }, (socket, request) => {
    if (!readSession(request)) {
      socket.close(4401, 'Authentication required');
      return;
    }

    clients.add(socket);
    socket.send(
      JSON.stringify({ type: 'hello', data: { status: getStatus() } } satisfies ServerMessage),
    );

    socket.on('message', (raw: Buffer | string) => {
      try {
        const message = JSON.parse(String(raw)) as ClientMessage;
        if (message.type === 'ping') {
          socket.send(
            JSON.stringify({ type: 'pong', data: { at: Date.now() } } satisfies ServerMessage),
          );
        }
      } catch {
        // Malformed frames from the browser are ignored on purpose.
      }
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}

export function connectedClients(): number {
  return clients.size;
}
