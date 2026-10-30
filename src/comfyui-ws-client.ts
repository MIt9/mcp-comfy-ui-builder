/**
 * ComfyUI WebSocket client for real-time execution tracking.
 * Connects to ws://{COMFYUI_HOST}/ws?clientId={uuid}
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Subscription-based event handling
 * - Multiple subscribers per connection
 * - Graceful degradation on connection failure
 */

import WS from 'ws';
import { randomUUID } from 'crypto';
import type {
  WSEvent,
  WSProgressEvent,
  WSExecutingEvent,
  WSExecutedEvent,
  WSStatusEvent,
  WSExecutionErrorEvent,
  WSExecutionCachedEvent,
  ExecutionProgress,
} from './types/comfyui-api-types.js';

// Configuration
const WS_RECONNECT_DELAY_MS = 1000;
const WS_MAX_RECONNECT_DELAY_MS = 30000;
const WS_RECONNECT_BACKOFF = 1.5;
const WS_PING_INTERVAL_MS = 30000;

// Callback types
export type ProgressCallback = (progress: ExecutionProgress) => void;
export type ErrorCallback = (error: Error) => void;

// Subscription handle
export interface Subscription {
  unsubscribe: () => void;
}

// Connection state
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Singleton WebSocket client manager for ComfyUI
 */
class ComfyUIWSClient {
  private ws: WS | null = null;
  private clientId: string;
  private wsUrl: string;
  private state: ConnectionState = 'disconnected';
  private reconnectDelay = WS_RECONNECT_DELAY_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  // Subscriber management
  private subscribers = new Map<
    string,
    {
      onProgress: ProgressCallback;
      onError: ErrorCallback;
    }
  >();

  // Execution tracking
  private executions = new Map<string, ExecutionProgress>();

  constructor() {
    this.clientId = randomUUID();
    this.wsUrl = this.buildWsUrl();
  }

  /** Identity used by both POST /prompt and the WebSocket connection. Does not connect. */
  getClientId(): string {
    return this.clientId;
  }

  private buildWsUrl(): string {
    const host = process.env.COMFYUI_HOST ?? 'http://127.0.0.1:8188';
    const wsHost = host
      .replace('http://', 'ws://')
      .replace('https://', 'wss://')
      .replace(/\/$/, '');
    return `${wsHost}/ws?clientId=${this.clientId}`;
  }

  /**
   * Connect to ComfyUI WebSocket. Idempotent - safe to call multiple times.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.state = 'connecting';
        this.ws = new WS(this.wsUrl);

        this.ws.on('open', () => {
          this.state = 'connected';
          this.reconnectDelay = WS_RECONNECT_DELAY_MS;
          this.startPing();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error: Error) => {
          if (this.state === 'connecting') {
            reject(error);
          }
          this.handleError(error);
        });

        this.ws.on('close', () => {
          this.handleClose();
        });
      } catch (error) {
        this.state = 'disconnected';
        reject(error);
      }
    });
  }

  /**
   * Subscribe to execution progress for a specific prompt_id
   */
  subscribe(promptId: string, onProgress: ProgressCallback, onError: ErrorCallback): Subscription {
    this.subscribers.set(promptId, { onProgress, onError });

    // Initialize progress tracking
    if (!this.executions.has(promptId)) {
      this.executions.set(promptId, {
        prompt_id: promptId,
        status: 'queued',
        completed_nodes: [],
        cached_nodes: [],
        outputs: {},
      });
    }

    return {
      unsubscribe: () => {
        this.subscribers.delete(promptId);
        this.executions.delete(promptId);
      },
    };
  }

  /**
   * Get current execution progress (synchronous)
   */
  getProgress(promptId: string): ExecutionProgress | null {
    return this.executions.get(promptId) ?? null;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WS.OPEN;
  }

  /**
   * Gracefully disconnect
   */
  disconnect(): void {
    this.stopReconnect();
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = 'disconnected';
    this.subscribers.clear();
    this.executions.clear();
  }

  // Private methods

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSEvent;

      switch (message.type) {
        case 'executing':
          this.handleExecuting(message);
          break;
        case 'progress':
          this.handleProgress(message);
          break;
        case 'executed':
          this.handleExecuted(message);
          break;
        case 'execution_error':
          this.handleExecutionError(message);
          break;
        case 'execution_cached':
          this.handleExecutionCached(message);
          break;
        case 'status':
          this.handleStatus(message);
          break;
      }
    } catch (error) {
      // Invalid message, ignore
    }
  }

  private handleExecuting(event: WSExecutingEvent): void {
    const { prompt_id, node } = event.data;
    const progress = this.executions.get(prompt_id);
    if (!progress) return;

    if (node === null) {
      // Execution finished
      progress.status = 'completed';
      progress.current_node = undefined;
    } else {
      progress.status = 'executing';
      progress.current_node = node;
      progress.current_node_progress = 0;
    }

    this.notifySubscriber(prompt_id, progress);
  }

  private handleProgress(event: WSProgressEvent): void {
    const { prompt_id, value, max } = event.data;
    if (!prompt_id) return; // Some progress events may not have prompt_id

    const progress = this.executions.get(prompt_id);
    if (!progress) return;

    progress.current_node_progress = max > 0 ? value / max : 0;
    this.notifySubscriber(prompt_id, progress);
  }

  private handleExecuted(event: WSExecutedEvent): void {
    const { prompt_id, node, output } = event.data;
    const progress = this.executions.get(prompt_id);
    if (!progress) return;

    progress.completed_nodes.push(node);
    progress.outputs[node] = output;
    this.notifySubscriber(prompt_id, progress);
  }

  private handleExecutionError(event: WSExecutionErrorEvent): void {
    const { prompt_id, node_id, exception_message, exception_type } = event.data;
    const progress = this.executions.get(prompt_id);
    if (!progress) return;

    progress.status = 'failed';
    progress.error = {
      node_id,
      message: exception_message,
      type: exception_type,
    };

    this.notifySubscriber(prompt_id, progress);
  }

  private handleExecutionCached(event: WSExecutionCachedEvent): void {
    const { prompt_id, nodes } = event.data;
    const progress = this.executions.get(prompt_id);
    if (!progress) return;

    progress.cached_nodes.push(...nodes);
    this.notifySubscriber(prompt_id, progress);
  }

  private handleStatus(event: WSStatusEvent): void {
    const queueRemaining = event.data.status.exec_info.queue_remaining;

    // Update queue position for all queued executions
    for (const progress of this.executions.values()) {
      if (progress.status === 'queued') {
        progress.queue_position = queueRemaining;
        this.notifySubscriber(progress.prompt_id, progress);
      }
    }
  }

  private notifySubscriber(promptId: string, progress: ExecutionProgress): void {
    const subscriber = this.subscribers.get(promptId);
    if (subscriber) {
      subscriber.onProgress({ ...progress });
    }
  }

  private handleError(error: Error): void {
    // Notify all subscribers of error
    for (const [, subscriber] of this.subscribers.entries()) {
      subscriber.onError(error);
    }
  }

  private handleClose(): void {
    this.stopPing();

    if (this.state !== 'disconnected') {
      this.state = 'reconnecting';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.stopReconnect();

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Exponential backoff
        this.reconnectDelay = Math.min(
          this.reconnectDelay * WS_RECONNECT_BACKOFF,
          WS_MAX_RECONNECT_DELAY_MS
        );
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WS.OPEN) {
        this.ws.ping();
      }
    }, WS_PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

// Singleton instance
let clientInstance: ComfyUIWSClient | null = null;

/**
 * Get or create singleton WebSocket client instance
 */
export function getWSClient(): ComfyUIWSClient {
  if (!clientInstance) {
    clientInstance = new ComfyUIWSClient();
  }
  return clientInstance;
}

/**
 * Cleanup singleton instance (for testing or shutdown)
 */
export function resetWSClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}
