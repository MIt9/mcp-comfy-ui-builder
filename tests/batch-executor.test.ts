/**
 * Unit tests for batch-executor (mocked comfyui).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmitPromptAndWait = vi.fn();
vi.mock('../src/comfyui-client.js', () => ({
  submitPromptAndWait: (...args: unknown[]) => mockSubmitPromptAndWait(...args),
}));

// Mock WebSocket client to force polling fallback
vi.mock('../src/comfyui-ws-client.js', () => ({
  getWSClient: () => ({
    connect: () => Promise.reject(new Error('WebSocket not available in tests')),
  }),
}));

describe('executeBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs one workflow and returns result', async () => {
    mockSubmitPromptAndWait.mockResolvedValueOnce({
      prompt_id: 'p1',
      status: 'completed',
      outputs: { '7': { images: [] } },
    });
    const { executeBatch } = await import('../src/workflow/batch-executor.js');
    const results = await executeBatch({
      workflows: [{ '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].prompt_id).toBe('p1');
    expect(results[0].status).toBe('completed');
    expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
  });

  it('runs two workflows with concurrency 1', async () => {
    mockSubmitPromptAndWait
      .mockResolvedValueOnce({ prompt_id: 'p1', status: 'completed', outputs: {} })
      .mockResolvedValueOnce({ prompt_id: 'p2', status: 'completed', outputs: {} });
    const { executeBatch } = await import('../src/workflow/batch-executor.js');
    const results = await executeBatch({
      workflows: [
        { '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } },
        { '2': { class_type: 'KSampler', inputs: {} } },
      ],
      concurrency: 1,
    });
    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(0);
    expect(results[1].index).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['completed', 'completed']);
  });

  it('reports failed when submitPromptAndWait returns failed', async () => {
    mockSubmitPromptAndWait.mockResolvedValueOnce({
      prompt_id: 'p1',
      status: 'failed',
      error: 'Node error',
    });
    const { executeBatch } = await import('../src/workflow/batch-executor.js');
    const results = await executeBatch({
      workflows: [{ '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } }],
    });
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('Node error');
  });

  it('does not submit another workflow after the first failure with stopOnError', async () => {
    mockSubmitPromptAndWait.mockResolvedValue({ prompt_id: 'failed', status: 'failed', error: 'bad node' });
    const { executeBatch } = await import('../src/workflow/batch-executor.js');
    const results = await executeBatch({ workflows: [{}, {}], concurrency: 1, stopOnError: true });
    expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });

  it('keeps one authoritative result when the progress observer throws', async () => {
    mockSubmitPromptAndWait.mockResolvedValue({ prompt_id: 'ok', status: 'completed', outputs: {} });
    const { executeBatch } = await import('../src/workflow/batch-executor.js');
    const results = await executeBatch({ workflows: [{}], onProgress: () => { throw new Error('observer failed'); } });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ prompt_id: 'ok', status: 'completed' });
  });
});
