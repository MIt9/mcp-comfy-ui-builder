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

  it('getHistory returns array with one entry when prompt_id given', async () => {
    const { getHistory } = await import('../src/comfyui-client.js');
    const single = { prompt_id: 'p1', outputs: { '7': { images: [{ filename: 'out.png' }] } } };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => single });
    const result = await getHistory('p1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(single);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/history/p1'), expect.any(Object));
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

  it('submitPrompt throws on non-ok response', async () => {
    const { submitPrompt } = await import('../src/comfyui-client.js');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Server error' });
    await expect(
      submitPrompt({ '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } })
    ).rejects.toThrow(/500|prompt failed/);
  });

  it('isComfyUIConfigured returns false when COMFYUI_HOST not set', async () => {
    const { isComfyUIConfigured } = await import('../src/comfyui-client.js');
    expect(isComfyUIConfigured()).toBe(false);
  });

  it('isComfyUIConfigured returns true when COMFYUI_HOST set', async () => {
    process.env.COMFYUI_HOST = 'http://localhost:8188';
    const { isComfyUIConfigured } = await import('../src/comfyui-client.js');
    expect(isComfyUIConfigured()).toBe(true);
  });
});
