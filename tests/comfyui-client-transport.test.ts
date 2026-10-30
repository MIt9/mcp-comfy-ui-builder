import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForCompletion, getHistoryExecutionResult } from '../src/comfyui-client.js';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), connect: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('../src/comfyui-ws-client.js', () => ({ getWSClient: () => ({ connect: mocks.connect, subscribe: mocks.subscribe }) }));

describe('explicit execution progress transports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.subscribe.mockReturnValue({ unsubscribe: mocks.unsubscribe });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ p1: { outputs: {}, status: { status_str: 'success' } } }) });
  });
  afterEach(() => vi.useRealTimers());

  it('polling mode never connects WebSocket', async () => {
    const result = await waitForCompletion('p1', 1000, undefined, 'polling');
    expect(result.status).toBe('completed');
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalled();
  });

  it('websocket mode propagates connection errors without polling', async () => {
    mocks.connect.mockRejectedValue(new Error('unavailable'));
    await expect(waitForCompletion('p1', 1000, undefined, 'websocket')).rejects.toThrow('unavailable');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('websocket mode recovers a run completed before subscription and cleans up', async () => {
    const outputs = { '1': { images: [{ filename: 'cached.png' }] } };
    mocks.fetch.mockImplementation(async () => {
      expect(mocks.subscribe).toHaveBeenCalledOnce();
      return { ok: true, json: async () => ({ p1: { outputs, status: { status_str: 'success', messages: [['execution_start', {}], ['execution_success', {}]] } } }) };
    });
    const result = await waitForCompletion('p1', 1000, undefined, 'websocket');
    expect(result).toMatchObject({ prompt_id: 'p1', status: 'completed', outputs });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('websocket mode never schedules recurring polling at 100% progress', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const resultPromise = waitForCompletion('p1', 1000, undefined, 'websocket');
    await vi.advanceTimersByTimeAsync(0);
    const onProgress = mocks.subscribe.mock.calls[0][1];
    onProgress({ prompt_id: 'p1', status: 'executing', current_node_progress: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await resultPromise).status).toBe('timeout');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not mistake running history with log messages or partial outputs for completion', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ p1: { status: { status_str: 'running', messages: [['execution_start', {}]] }, outputs: { '1': { text: ['partial'] } } } }) });
    const resultPromise = waitForCompletion('p1', 1000, undefined, 'websocket');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await resultPromise).status).toBe('timeout');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores a failed bootstrap request and cleans up after a live terminal event', async () => {
    // An HTTP failure is handled without leaving a rejection or removing the live subscription.
    mocks.fetch.mockResolvedValue({ ok: false, status: 400, statusText: 'Unavailable' });
    const resultPromise = waitForCompletion('p1', 1000, undefined, 'websocket');
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
    const onProgress = mocks.subscribe.mock.calls[0][1];
    onProgress({ prompt_id: 'p1', status: 'completed', outputs: {} });
    expect((await resultPromise).status).toBe('completed');
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('loads cached outputs from history when the terminal WebSocket event has none', async () => {
    const outputs = { '7': { images: [{ filename: 'cached.png' }] } };
    mocks.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ p1: { status: { status_str: 'success', messages: [['execution_cached', { nodes: ['7'] }], ['execution_success', {}]] }, outputs } }) });
    const resultPromise = waitForCompletion('p1', 1000, undefined, 'websocket');
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    mocks.subscribe.mock.calls[0][1]({ prompt_id: 'p1', status: 'completed', outputs: {} });
    expect(await resultPromise).toMatchObject({ status: 'completed', outputs });
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('recorded ComfyUI execution classification', () => {
  it('does not classify successful lifecycle event tuples as errors', () => {
    const result = getHistoryExecutionResult({ status: { status_str: 'success', messages: [['execution_start', {}], ['execution_cached', { nodes: ['1'] }], ['execution_success', {}]] }, outputs: { '1': { text: ['done'] } } }, 'p1');
    expect(result?.status).toBe('completed');
    expect(result?.error).toBeUndefined();
  });

  it('keeps running entries with lifecycle logs and partial outputs nonfinal', () => {
    expect(getHistoryExecutionResult({ status: { status_str: 'running', messages: [['execution_start', {}]] }, outputs: { '1': { text: ['partial'] } } }, 'p1')).toBeNull();
  });

  it('preserves terminal errors and partial outputs', () => {
    const outputs = { '1': { text: ['partial'] } };
    const result = getHistoryExecutionResult({ status: { status_str: 'error', messages: [['execution_start', {}], ['execution_error', { node_id: '2', exception_message: 'broken' }]] }, outputs }, 'p1');
    expect(result).toMatchObject({ prompt_id: 'p1', status: 'failed', outputs });
    expect(result?.error).toContain('broken');
  });
});
