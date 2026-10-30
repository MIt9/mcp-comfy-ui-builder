import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerExecutionTools } from '../src/tools/execution-tools.js';
import * as comfyui from '../src/comfyui-client.js';
import { getWSClient } from '../src/comfyui-ws-client.js';

vi.mock('../src/comfyui-client.js', () => ({
  isComfyUIConfigured: vi.fn(() => true),
  getSystemStats: vi.fn(), submitPrompt: vi.fn(), waitForCompletion: vi.fn(),
  isWebSocketAvailable: vi.fn(() => false), getHistory: vi.fn(), getQueue: vi.fn(),
}));
vi.mock('../src/comfyui-ws-client.js', () => ({ getWSClient: vi.fn(() => ({ connect: vi.fn(), getProgress: vi.fn() })) }));

const workflow = JSON.stringify({ '1': { class_type: 'SaveImage', inputs: {} } });

async function withClient(test: (client: Client) => Promise<void>) {
  const server = new McpServer({ name: 'execution-test', version: '1.0.0' });
  registerExecutionTools(server);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try { await test(client); } finally { await client.close(); await server.close(); }
}

const payload = (result: Awaited<ReturnType<Client['callTool']>>) => JSON.parse((result.content as Array<{ text: string }>)[0].text);

describe('consolidated execution tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(comfyui.getSystemStats).mockRejectedValue(new Error('busy'));
    vi.mocked(comfyui.submitPrompt).mockResolvedValue({ prompt_id: 'p1' });
    vi.mocked(comfyui.waitForCompletion).mockResolvedValue({ prompt_id: 'p1', status: 'completed', outputs: { '1': { text: ['caption'] } } });
    process.env.COMFYUI_HOST = 'http://localhost:8188';
  });

  it('waits by default and preserves full outputs', async () => withClient(async (client) => {
    const result = payload(await client.callTool({ name: 'execute_workflow', arguments: { workflow } }));
    expect(result.outputs['1'].text).toEqual(['caption']);
    expect(comfyui.waitForCompletion).toHaveBeenCalledWith('p1', 300000, undefined, 'auto');
  }));

  it('queues without waiting and rejects conflicting options before submission', async () => withClient(async (client) => {
    expect(payload(await client.callTool({ name: 'execute_workflow', arguments: { workflow, wait: false } }))).toEqual({ prompt_id: 'p1', status: 'queued' });
    expect(comfyui.waitForCompletion).not.toHaveBeenCalled();
    vi.mocked(comfyui.submitPrompt).mockClear();
    const invalid = await client.callTool({ name: 'execute_workflow', arguments: { workflow, wait: false, include_events: true } });
    expect(invalid.isError).toBe(true);
    expect(comfyui.submitPrompt).not.toHaveBeenCalled();
  }));

  it('rejects malformed workflows and dangling links before submission', async () => withClient(async (client) => {
    for (const invalidWorkflow of ['null', '{"1":null}', JSON.stringify({ '1': { class_type: 'SaveImage', inputs: { images: ['missing', 0] } } }), JSON.stringify({ '1': { class_type: 'SaveImage', inputs: { images: ['toString', 0] } } })]) {
      expect((await client.callTool({ name: 'execute_workflow', arguments: { workflow: invalidWorkflow } })).isError).toBe(true);
    }
    expect(comfyui.submitPrompt).not.toHaveBeenCalled();
  }));

  it('uses requested transport and bounds returned event history', async () => withClient(async (client) => {
    vi.mocked(comfyui.waitForCompletion).mockImplementation(async (promptId, _timeout, onProgress) => {
      for (let i = 0; i < 12; i++) onProgress?.({ prompt_id: promptId, status: 'executing', current_node: String(i), completed_nodes: [], cached_nodes: [], outputs: {} });
      return { prompt_id: promptId, status: 'completed' };
    });
    const result = payload(await client.callTool({ name: 'execute_workflow', arguments: { workflow, include_events: true, progress_transport: 'websocket', timeout_ms: 2000 } }));
    expect(result.event_count).toBe(12);
    expect(result.events).toHaveLength(10);
    expect(result.events[0].current_node).toBe('2');
    expect(comfyui.waitForCompletion).toHaveBeenCalledWith('p1', 2000, expect.any(Function), 'websocket');
    expect(getWSClient).toHaveBeenCalled();
  }));

  it('retains prompt id if waiting fails after submission', async () => withClient(async (client) => {
    vi.mocked(comfyui.waitForCompletion).mockRejectedValue(new Error('connection lost'));
    const result = await client.callTool({ name: 'execute_workflow', arguments: { workflow } });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ prompt_id: 'p1', error: 'connection lost' });
  }));

  it('provides history outputs and full tuple-encoded errors', async () => withClient(async (client) => {
    vi.mocked(comfyui.getHistory).mockResolvedValue([{ status: { status_str: 'error', messages: [['execution_start', {}], ['execution_error', { node_id: '1', traceback: ['full traceback'], exception_message: 'failed' }]] }, outputs: { '1': { text: ['caption'], images: [{ filename: 'a b.png' }] } } }]);
    const summary = payload(await client.callTool({ name: 'get_execution', arguments: { prompt_id: 'p1' } }));
    expect(summary.outputs['1'].text).toEqual(['caption']);
    expect(summary.images[0].view_url).toContain('filename=a+b.png');
    const errors = payload(await client.callTool({ name: 'get_execution', arguments: { prompt_id: 'p1', view: 'errors' } }));
    expect(errors.errors).toEqual([{ node_id: '1', traceback: ['full traceback'], exception_message: 'failed' }]);
  }));

  it('recognizes prompt ids in ComfyUI queue tuples', async () => withClient(async (client) => {
    vi.mocked(comfyui.getHistory).mockResolvedValue([]);
    vi.mocked(comfyui.getQueue).mockResolvedValue({ queue_running: [[1, 'p1', {}]], queue_pending: [] });
    const result = payload(await client.callTool({ name: 'get_execution', arguments: { prompt_id: 'p1', view: 'progress' } }));
    expect(result.status).toBe('executing');
  }));
});
