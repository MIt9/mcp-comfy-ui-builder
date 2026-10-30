/**
 * Unit tests for chainer (executeChain, resolveStepWorkflow).
 * executeChain is integration-heavy (ComfyUI, loadWorkflow); we test resolve logic via executeChain with mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeChain } from '../src/workflow/chainer.js';
import type { ChainStep } from '../src/workflow/chainer.js';

const mockSubmitPromptAndWait = vi.fn();
const mockSubmitPromptAndWaitWithProgress = vi.fn();
const mockWsConnect = vi.fn();
const mockFetchOutputByFilename = vi.fn();
const mockUploadImage = vi.fn();
const mockLoadWorkflow = vi.fn();
vi.mock('../src/comfyui-client.js', () => ({
  submitPromptAndWait: (...args: unknown[]) => mockSubmitPromptAndWait(...args),
  submitPromptAndWaitWithProgress: (...args: unknown[]) => mockSubmitPromptAndWaitWithProgress(...args),
  fetchOutputByFilename: (...args: unknown[]) => mockFetchOutputByFilename(...args),
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
  isComfyUIConfigured: () => true,
}));
vi.mock('../src/workflow/workflow-storage.js', () => ({
  loadWorkflow: (name: string) => mockLoadWorkflow(name),
}));

// Default to polling; individual tests can exercise the shared WebSocket path.
vi.mock('../src/comfyui-ws-client.js', () => ({
  getWSClient: () => ({
    connect: () => mockWsConnect(),
  }),
}));

describe('chainer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWsConnect.mockRejectedValue(new Error('WebSocket not available in tests'));
  });

  describe('executeChain', () => {
    it('resolves workflow from object and runs one step', async () => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({
        prompt_id: 'p1',
        status: 'completed',
        outputs: {},
      });
      const steps: ChainStep[] = [
        {
          workflow: {
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'x.safetensors' } },
          },
        },
      ];
      const results = await executeChain(steps);
      expect(results).toHaveLength(1);
      expect(results[0].stepIndex).toBe(0);
      expect(results[0].prompt_id).toBe('p1');
      expect(results[0].status).toBe('completed');
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    });

    it('applies params override to workflow', async () => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({
        prompt_id: 'p1',
        status: 'completed',
        outputs: {},
      });
      const steps: ChainStep[] = [
        {
          workflow: {
            '1': { class_type: 'CLIPTextEncode', inputs: { text: 'old', clip: ['0', 1] } },
          },
          params: { '1': { text: 'new' } },
        },
      ];
      await executeChain(steps);
      const call = mockSubmitPromptAndWait.mock.calls[0][0];
      expect(call['1'].inputs.text).toBe('new');
    });

    it('resolves workflow from saved name via loadWorkflow', async () => {
      mockLoadWorkflow.mockResolvedValueOnce({
        '1': { class_type: 'KSampler', inputs: {} },
      });
      mockSubmitPromptAndWait.mockResolvedValueOnce({
        prompt_id: 'p1',
        status: 'completed',
        outputs: {},
      });
      const steps: ChainStep[] = [{ workflow: 'my_saved_workflow' }];
      await executeChain(steps);
      expect(mockLoadWorkflow).toHaveBeenCalledWith('my_saved_workflow');
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    });

    it('stops on error when stopOnError true', async () => {
      mockSubmitPromptAndWait.mockRejectedValueOnce(new Error('fail'));
      const steps: ChainStep[] = [
        { workflow: { '1': { class_type: 'EmptyLatentImage', inputs: {} } } },
        { workflow: { '2': { class_type: 'SaveImage', inputs: {} } } },
      ];
      const results = await executeChain(steps, { stopOnError: true });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    });

    it('passes the selected node/image output, preserving storage type and upload subfolder', async () => {
      const nextWorkflow = { '3': { class_type: 'LoadImage', inputs: { image: 'stale.png' } } };
      const bytes = new ArrayBuffer(8);
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'p1', status: 'completed', outputs: {
        '8': { images: [{ filename: 'wrong-node.png' }] },
        '9': { images: [{ filename: 'wrong-index.png' }, { filename: 'selected.png', subfolder: 'previews', type: 'temp' }] },
      } }).mockResolvedValueOnce({ prompt_id: 'p2', status: 'completed', outputs: {} });
      mockFetchOutputByFilename.mockResolvedValueOnce(bytes);
      mockUploadImage.mockResolvedValueOnce({ name: 'uploaded.png', subfolder: 'chain' });
      const results = await executeChain([
        { workflow: {} },
        { workflow: nextWorkflow, inputFrom: { step: 0, outputNode: '9', outputIndex: 1 }, outputTo: 'image' },
      ]);
      expect(results.map((result) => result.status)).toEqual(['completed', 'completed']);
      expect(mockFetchOutputByFilename).toHaveBeenCalledWith('selected.png', { subfolder: 'previews', type: 'temp' });
      expect(mockUploadImage).toHaveBeenCalledWith(bytes, 'selected.png');
      expect(mockSubmitPromptAndWait.mock.calls[1][0]['3'].inputs.image).toBe('chain/uploaded.png');
      expect(nextWorkflow['3'].inputs.image).toBe('stale.png');
    });

    it('does not run dependent steps after upstream failure, but continues independent steps', async () => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'failed', status: 'failed', error: 'upstream error' })
        .mockResolvedValueOnce({ prompt_id: 'independent', status: 'completed', outputs: {} });
      const results = await executeChain([
        { workflow: {} },
        { workflow: { '2': { class_type: 'LoadImage', inputs: { image: 'stale.png' } } }, inputFrom: { step: 0, outputNode: '9', outputIndex: 0 }, outputTo: 'image' },
        { workflow: {} },
      ]);
      expect(results.map((result) => result.status)).toEqual(['failed', 'failed', 'completed']);
      expect(results[1].error).toContain('failed step 0');
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(2);
      expect(mockFetchOutputByFilename).not.toHaveBeenCalled();
    });

    it.each([
      { inputFrom: { step: 0, outputNode: 'missing', outputIndex: 0 }, outputTo: 'image', error: 'No image' },
      { inputFrom: { step: 0, outputNode: '9', outputIndex: 8 }, outputTo: 'image', error: 'No image' },
      { inputFrom: { step: 1, outputNode: '9', outputIndex: 0 }, outputTo: 'image', error: 'earlier step' },
      { inputFrom: { step: 0, outputNode: '9', outputIndex: 0 }, outputTo: 'missing', error: 'No target node' },
      { inputFrom: { step: 0, outputNode: '9', outputIndex: 0 }, error: 'provided together' },
    ])('rejects invalid chain image selection ($error) before submission', async ({ inputFrom, outputTo, error }) => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'p1', status: 'completed', outputs: { '9': { images: [{ filename: 'image.png' }] } } });
      const results = await executeChain([
        { workflow: {} },
        { workflow: { '2': { class_type: 'LoadImage', inputs: { image: 'stale.png' } } }, inputFrom, outputTo },
      ]);
      expect(results[1].status).toBe('failed');
      expect(results[1].error).toContain(error);
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
      expect(mockFetchOutputByFilename).not.toHaveBeenCalled();
    });

    it('accepts inline workflow JSON strings without loading a saved file', async () => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'json', status: 'completed', outputs: {} });
      await executeChain([{ workflow: '{"1":{"class_type":"Example","inputs":{}}}' }]);
      expect(mockLoadWorkflow).not.toHaveBeenCalled();
      expect(mockSubmitPromptAndWait.mock.calls[0][0]['1'].class_type).toBe('Example');
    });

    it('records workflow-loading errors per step and continues when stopOnError is false', async () => {
      mockLoadWorkflow.mockRejectedValueOnce(new Error('saved workflow missing'));
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'next', status: 'completed', outputs: {} });
      const results = await executeChain([{ workflow: 'missing' }, { workflow: {} }]);
      expect(results.map((result) => result.status)).toEqual(['failed', 'completed']);
      expect(results[0].error).toContain('saved workflow missing');
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    });

    it('uses the preconnected WebSocket path for every chain step', async () => {
      mockWsConnect.mockResolvedValue(undefined);
      mockSubmitPromptAndWaitWithProgress.mockResolvedValue({ prompt_id: 'ws', status: 'completed', outputs: {} });
      const results = await executeChain([{ workflow: {} }, { workflow: {} }], { timeoutMs: 1500 });
      expect(results.map((result) => result.status)).toEqual(['completed', 'completed']);
      expect(mockWsConnect).toHaveBeenCalledTimes(1);
      expect(mockSubmitPromptAndWaitWithProgress).toHaveBeenCalledTimes(2);
      expect(mockSubmitPromptAndWaitWithProgress).toHaveBeenCalledWith({}, 1500);
      expect(mockSubmitPromptAndWait).not.toHaveBeenCalled();
    });

    it('stops before submitting a dependent step if transferring the selected image fails', async () => {
      mockSubmitPromptAndWait.mockResolvedValueOnce({ prompt_id: 'p1', status: 'completed', outputs: { '9': { images: [{ filename: 'image.png' }] } } });
      mockFetchOutputByFilename.mockRejectedValueOnce(new Error('image download failed'));
      const results = await executeChain([
        { workflow: {} },
        { workflow: { '2': { class_type: 'LoadImage', inputs: { image: 'stale.png' } } }, inputFrom: { step: 0, outputNode: '9', outputIndex: 0 }, outputTo: 'image' },
        { workflow: {} },
      ], { stopOnError: true });
      expect(results).toHaveLength(2);
      expect(results[1].status).toBe('failed');
      expect(results[1].error).toContain('image download failed');
      expect(mockUploadImage).not.toHaveBeenCalled();
      expect(mockSubmitPromptAndWait).toHaveBeenCalledTimes(1);
    });
  });
});
