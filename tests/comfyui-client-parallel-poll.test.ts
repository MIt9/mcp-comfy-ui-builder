/**
 * Test: polling wins when WebSocket connects but receives no progress events (MPS scenario).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

const mockFetch = vi.fn();

vi.mock('node-fetch', () => ({ default: mockFetch }));

// WS connects but never emits progress — would eventually timeout
vi.mock('../src/comfyui-ws-client.js', () => ({
  getWSClient: () => ({
    getClientId: () => 'parallel-test-client',
    connect: () => Promise.resolve(),
    subscribe: () => ({ unsubscribe: () => {} }),
    isConnected: () => true,
  }),
  resetWSClient: () => {},
}));

describe('ComfyUI client — parallel polling when WS has no events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMFYUI_HOST;
  });
  afterEach(() => {
    delete process.env.COMFYUI_HOST;
  });

  it('polling resolves with completed when WS never sends progress events', async () => {
    const promptId = 'p-no-ws-events';
    const completedOutputs = {
      '7': { images: [{ filename: 'out.png', subfolder: 'output', type: 'output' }] },
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompt_id: promptId }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            prompt_id: promptId,
            outputs: completedOutputs,
            status: { status_str: 'success' },
          },
        ],
      });

    const { submitPromptAndWaitWithProgress } = await import('../src/comfyui-client.js');
    const workflow: ComfyUIWorkflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
    };

    const result = await submitPromptAndWaitWithProgress(workflow, 10_000);

    expect(result.prompt_id).toBe(promptId);
    expect(result.status).toBe('completed');
    expect(result.outputs).toEqual(completedOutputs);

    const historyCalls = mockFetch.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('/history')
    );
    expect(historyCalls.length).toBeGreaterThanOrEqual(1);
  });
});
