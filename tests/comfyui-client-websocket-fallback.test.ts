/**
 * Unit tests for WebSocket + parallel polling (MPS/macOS where WS may not receive events).
 * Tests execute_workflow_sync resolving with completed via polling when WS times out or gives no progress.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

const mockFetch = vi.fn();

// Mock node-fetch
vi.mock('node-fetch', () => ({ default: mockFetch }));

// Mock WebSocket: emits 100% progress but never completed (one MPS scenario)
const createWSMockWith100Percent = () => ({
  getClientId: () => 'fallback-test-client',
  connect: () => Promise.resolve(),
  subscribe: (promptId: string, onProgress: (p: unknown) => void) => {
    queueMicrotask(() => {
      onProgress({
        prompt_id: promptId,
        status: 'executing',
        current_node_progress: 1,
        completed_nodes: [],
        cached_nodes: [],
        outputs: {},
      });
    });
    return { unsubscribe: () => {} };
  },
  isConnected: () => true,
});

vi.mock('../src/comfyui-ws-client.js', () => ({
  getWSClient: () => createWSMockWith100Percent(),
  resetWSClient: () => {},
}));

describe('ComfyUI client — WebSocket + parallel polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMFYUI_HOST;
  });
  afterEach(() => {
    delete process.env.COMFYUI_HOST;
  });

  it('resolves with completed when WS shows 100% but no completed event (poll or 100% fallback wins)', async () => {
    const promptId = 'p-fallback-test';
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

    // Polling runs in parallel; verify GET /history was called
    const historyCalls = mockFetch.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('/history')
    );
    expect(historyCalls.length).toBeGreaterThanOrEqual(1);
  });
});
