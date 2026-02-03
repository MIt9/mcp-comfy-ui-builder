/**
 * Unit tests for ComfyUI API client (mocked fetch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

// Mock node-fetch before importing the client
const mockFetch = vi.fn();
vi.mock('node-fetch', () => ({ default: mockFetch }));

describe('ComfyUI client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMFYUI_HOST;
  });
  afterEach(() => {
    delete process.env.COMFYUI_HOST;
  });

  it('submitPrompt returns prompt_id', async () => {
    const { submitPrompt } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: 'abc-123' }),
    });
    const workflow: ComfyUIWorkflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
    };
    const result = await submitPrompt(workflow);
    expect(result).toEqual({ prompt_id: 'abc-123' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/prompt'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: workflow }),
      })
    );
  });

  it('getHistory returns array when no prompt_id', async () => {
    const { getHistory } = await import('../src/comfyui-client.js');
    const entries = [{ prompt_id: 'p1', outputs: {} }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => entries });
    const result = await getHistory();
    expect(result).toEqual(entries);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/history'), expect.any(Object));
  });

  it('getHistory normalizes object response when no prompt_id (ComfyUI format)', async () => {
    const { getHistory } = await import('../src/comfyui-client.js');
    const obj = {
      'id-1': { outputs: {}, status: { status_str: 'completed' } },
      'id-2': { outputs: { '7': { images: [{ filename: 'out.png' }] } }, status: { status_str: 'completed' } },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => obj });
    const result = await getHistory();
    expect(result).toHaveLength(2);
    expect(result[0].prompt_id).toBe('id-2');
    expect(result[1].prompt_id).toBe('id-1');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/history'), expect.any(Object));
  });

  it('getHistory returns array with one entry when prompt_id given', async () => {
    const { getHistory } = await import('../src/comfyui-client.js');
    const single = { prompt_id: 'p1', outputs: { '7': { images: [{ filename: 'out.png' }] } } };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => single });
    const result = await getHistory('p1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(single);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/history/p1'), expect.any(Object));
  });

  it('fetchOutputByFilename fetches /view by filename', async () => {
    const { fetchOutputByFilename } = await import('../src/comfyui-client.js');
    const bytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => bytes.buffer });
    const result = await fetchOutputByFilename('out.png', { subfolder: 'output', type: 'output' });
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)).toEqual(bytes);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/view\?.*filename=out\.png.*type=output.*subfolder=output/),
      expect.any(Object)
    );
  });

  it('getQueue returns queue_running and queue_pending', async () => {
    const { getQueue } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ queue_running: [1], queue_pending: [2, 3] }),
    });
    const result = await getQueue();
    expect(result).toEqual({ queue_running: [1], queue_pending: [2, 3] });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/queue'), expect.any(Object));
  });

  it('getObjectInfo returns node definitions from /object_info', async () => {
    const { getObjectInfo } = await import('../src/comfyui-client.js');
    const objectInfo = {
      KSampler: {
        input: { required: { model: ['MODEL'], positive: ['CONDITIONING'] }, optional: {} },
        output: ['LATENT'],
        output_name: ['LATENT'],
        category: 'sampling',
      },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => objectInfo });
    const result = await getObjectInfo();
    expect(result).toEqual(objectInfo);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/object_info'), expect.any(Object));
  });

  it('submitPromptAndWait returns completed result when history has entry', async () => {
    const { submitPromptAndWait } = await import('../src/comfyui-client.js');
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: 'p1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          prompt_id: 'p1',
          outputs: { '7': { images: [{ filename: 'out.png', subfolder: 'output', type: 'output' }] } },
          status: {},
        }),
      });
    const workflow = { '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } };
    const result = await submitPromptAndWait(workflow, 5000);
    expect(result.prompt_id).toBe('p1');
    expect(result.status).toBe('completed');
    expect(result.outputs).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/prompt'), expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/history/p1'), expect.any(Object));
  });

  it('submitPrompt throws on non-ok response', async () => {
    const { submitPrompt } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Server error' });
    await expect(
      submitPrompt({ '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } })
    ).rejects.toThrow(/500|prompt failed/);
  });

  it('isComfyUIConfigured returns true by default (connects to local ComfyUI)', async () => {
    const { isComfyUIConfigured } = await import('../src/comfyui-client.js');
    expect(isComfyUIConfigured()).toBe(true);
  });

  it('interruptExecution sends POST /interrupt without body', async () => {
    const { interruptExecution } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: true });
    await interruptExecution();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/interrupt'),
      expect.objectContaining({ method: 'POST', body: '{}' })
    );
  });

  it('interruptExecution sends prompt_id when given', async () => {
    const { interruptExecution } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: true });
    await interruptExecution('pid-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/interrupt'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt_id: 'pid-1' }),
      })
    );
  });

  it('clearQueue sends POST /queue with clear true', async () => {
    const { clearQueue } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: true });
    await clearQueue();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/queue'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clear: true }),
      })
    );
  });

  it('deleteQueueItems sends POST /queue with delete array', async () => {
    const { deleteQueueItems } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteQueueItems(['p1', 'p2']);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/queue'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ delete: ['p1', 'p2'] }),
      })
    );
  });

  it('deleteQueueItems does not call fetch when array empty', async () => {
    const { deleteQueueItems } = await import('../src/comfyui-client.js');
    await deleteQueueItems([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
