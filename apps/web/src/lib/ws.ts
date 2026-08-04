import { WS_PATH } from '@phybot/shared';
import type { ClientMessage, ServerMessage } from '@phybot/shared';

type Listener = (message: ServerMessage) => void;
type StatusListener = (status: RealtimeStatus) => void;

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

const PING_INTERVAL_MS = 25_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Single reconnecting WebSocket client shared by the whole app. */
class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = MIN_BACKOFF_MS;
  private status: RealtimeStatus = 'closed';
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.socket?.close();
    this.socket = null;
    this.setStatus('closed');
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private connect(): void {
    if (!this.started) return;
    this.setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}${WS_PATH}`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.backoffMs = MIN_BACKOFF_MS;
      this.setStatus('open');
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      for (const listener of this.listeners) listener(parsed);
    });

    socket.addEventListener('close', () => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.setStatus('closed');
      if (!this.started) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private setStatus(status: RealtimeStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

export const realtimeClient = new RealtimeClient();
