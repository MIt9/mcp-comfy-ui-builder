/**
 * Unit tests for ComfyUI WebSocket client (mocked WebSocket).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  public static OPEN = 1;
  public static CLOSED = 3;

  public readyState = 1; // OPEN
  public close = vi.fn();
  public ping = vi.fn();

  constructor(public url: string) {
    super();
    // Simulate connection opening
    setTimeout(() => this.emit('open'), 10);
  }
}

// Mock the ws module
vi.mock('ws', () => ({
  default: MockWebSocket,
}));

describe('ComfyUI WebSocket Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMFYUI_HOST;
  });

  afterEach(async () => {
    const { resetWSClient } = await import('../src/comfyui-ws-client.js');
    resetWSClient();
    delete process.env.COMFYUI_HOST;
  });

  it('connects to WebSocket with client ID', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();

    await client.connect();

    expect(client.isConnected()).toBe(true);
  });

  it('exposes the same stable client id used in the WebSocket URL without connecting', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    const identity = client.getClientId();
    expect(identity).toBeTruthy();
    expect(client.getClientId()).toBe(identity);
    expect(client.isConnected()).toBe(false);
    await client.connect();
    const wsUrl = (client as unknown as { wsUrl: string }).wsUrl;
    expect(new URL(wsUrl).searchParams.get('clientId')).toBe(identity);
  });

  it('builds correct WebSocket URL from COMFYUI_HOST', async () => {
    process.env.COMFYUI_HOST = 'http://localhost:8188';
    const { getWSClient, resetWSClient } = await import('../src/comfyui-ws-client.js');

    resetWSClient();
    const client = getWSClient();
    await client.connect();

    // Access private wsUrl through type assertion
    const wsUrl = (client as any).wsUrl as string;
    expect(wsUrl).toMatch(/^ws:\/\/localhost:8188\/ws\?clientId=/);
  });

  it('converts https to wss in URL', async () => {
    process.env.COMFYUI_HOST = 'https://example.com:8188';
    const { getWSClient, resetWSClient } = await import('../src/comfyui-ws-client.js');

    resetWSClient();
    const client = getWSClient();
    await client.connect();

    const wsUrl = (client as any).wsUrl as string;
    expect(wsUrl).toMatch(/^wss:\/\/example.com:8188\/ws\?clientId=/);
  });

  it('subscribes to execution progress', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    const errorCallback = vi.fn();
    const sub = client.subscribe('test-prompt', progressCallback, errorCallback);

    expect(sub).toHaveProperty('unsubscribe');
    expect(typeof sub.unsubscribe).toBe('function');

    sub.unsubscribe();
  });

  it('handles executing event (node started)', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    // Simulate WebSocket message
    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'executing',
          data: { prompt_id: 'p1', node: 'node1' },
        })
      )
    );

    // Wait for event processing
    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_id: 'p1',
        status: 'executing',
        current_node: 'node1',
      })
    );
  });

  it('handles executing event (execution finished)', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'executing',
          data: { prompt_id: 'p1', node: null },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_id: 'p1',
        status: 'completed',
        current_node: undefined,
      })
    );
  });

  it('handles progress event', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'progress',
          data: { prompt_id: 'p1', value: 50, max: 100 },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        current_node_progress: 0.5,
      })
    );
  });

  it('handles executed event', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'executed',
          data: {
            prompt_id: 'p1',
            node: 'node5',
            output: { images: [{ filename: 'output.png' }] },
          },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_nodes: expect.arrayContaining(['node5']),
        outputs: expect.objectContaining({
          node5: expect.objectContaining({
            images: expect.arrayContaining([expect.objectContaining({ filename: 'output.png' })]),
          }),
        }),
      })
    );
  });

  it('handles execution_error event', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'execution_error',
          data: {
            prompt_id: 'p1',
            node_id: 'node3',
            exception_message: 'Model not found',
            exception_type: 'FileNotFoundError',
            executed: ['node1', 'node2'],
            traceback: ['line 1', 'line 2'],
          },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          node_id: 'node3',
          message: 'Model not found',
          type: 'FileNotFoundError',
        }),
      })
    );
  });

  it('handles execution_cached event', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'execution_cached',
          data: {
            prompt_id: 'p1',
            nodes: ['node1', 'node2'],
          },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        cached_nodes: expect.arrayContaining(['node1', 'node2']),
      })
    );
  });

  it('handles status event with queue info', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'status',
          data: {
            status: {
              exec_info: {
                queue_remaining: 3,
              },
            },
          },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        queue_position: 3,
      })
    );
  });

  it('getProgress returns current progress synchronously', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    client.subscribe('p1', vi.fn(), vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'executing',
          data: { prompt_id: 'p1', node: 'node2' },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    const progress = client.getProgress('p1');
    expect(progress).toMatchObject({
      prompt_id: 'p1',
      status: 'executing',
      current_node: 'node2',
    });
  });

  it('getProgress returns null for unknown prompt_id', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progress = client.getProgress('unknown');
    expect(progress).toBeNull();
  });

  it('unsubscribe removes subscription and progress tracking', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    const sub = client.subscribe('p1', progressCallback, vi.fn());

    sub.unsubscribe();

    // Send event after unsubscribe
    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'executing',
          data: { prompt_id: 'p1', node: 'node1' },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    // Should not be called after unsubscribe
    expect(progressCallback).not.toHaveBeenCalled();

    // Progress should be removed
    const progress = client.getProgress('p1');
    expect(progress).toBeNull();
  });

  it('disconnect closes connection and clears state', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    client.subscribe('p1', vi.fn(), vi.fn());
    client.disconnect();

    expect(client.isConnected()).toBe(false);
    expect(client.getProgress('p1')).toBeNull();
  });

  it('handles multiple concurrent subscriptions', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const callback3 = vi.fn();

    client.subscribe('p1', callback1, vi.fn());
    client.subscribe('p2', callback2, vi.fn());
    client.subscribe('p3', callback3, vi.fn());

    const ws = (client as any).ws as MockWebSocket;

    // Send events for different prompts
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'executing', data: { prompt_id: 'p1', node: 'n1' } })));
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'executing', data: { prompt_id: 'p2', node: 'n2' } })));
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'executing', data: { prompt_id: 'p3', node: 'n3' } })));

    await new Promise((r) => setTimeout(r, 20));

    // Each callback should be called only for its prompt
    expect(callback1).toHaveBeenCalledWith(expect.objectContaining({ prompt_id: 'p1', current_node: 'n1' }));
    expect(callback2).toHaveBeenCalledWith(expect.objectContaining({ prompt_id: 'p2', current_node: 'n2' }));
    expect(callback3).toHaveBeenCalledWith(expect.objectContaining({ prompt_id: 'p3', current_node: 'n3' }));
  });

  it('ignores invalid JSON messages', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    const errorCallback = vi.fn();
    client.subscribe('p1', progressCallback, errorCallback);

    const ws = (client as any).ws as MockWebSocket;
    ws.emit('message', Buffer.from('invalid json {'));

    await new Promise((r) => setTimeout(r, 20));

    // Should not crash or call callbacks
    expect(progressCallback).not.toHaveBeenCalled();
    expect(errorCallback).not.toHaveBeenCalled();
  });

  it('ignores unknown event types', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    const ws = (client as any).ws as MockWebSocket;
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'unknown_event_type',
          data: { some: 'data' },
        })
      )
    );

    await new Promise((r) => setTimeout(r, 20));

    // Should not call callback for unknown events
    expect(progressCallback).not.toHaveBeenCalled();
  });

  it('singleton getWSClient returns same instance', async () => {
    const { getWSClient } = await import('../src/comfyui-ws-client.js');

    const client1 = getWSClient();
    const client2 = getWSClient();

    expect(client1).toBe(client2);
  });

  it('resetWSClient creates new instance', async () => {
    const { getWSClient, resetWSClient } = await import('../src/comfyui-ws-client.js');

    const client1 = getWSClient();
    await client1.connect();

    resetWSClient();

    const client2 = getWSClient();

    expect(client1).not.toBe(client2);
    expect(client1.isConnected()).toBe(false);
  });
});
