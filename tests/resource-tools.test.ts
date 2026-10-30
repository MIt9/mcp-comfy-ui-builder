import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as comfyui from '../src/comfyui-client.js';
import * as outputs from '../src/output-manager.js';
import { ModelManager } from '../src/model-manager.js';
import { registerResourceTools } from '../src/tools/resource-tools.js';

vi.mock('../src/comfyui-client.js', () => ({ isComfyUIConfigured: vi.fn(() => true), getHistory: vi.fn(), getFirstOutputImageRef: vi.fn(), getSystemStats: vi.fn() }));
vi.mock('../src/output-manager.js', () => ({ listOutputs: vi.fn(), downloadByFilename: vi.fn(), downloadAllOutputs: vi.fn() }));

async function run(name: string, args: Record<string, unknown>, manager = new ModelManager({ getObjectInfo: async () => ({}) })) {
  const server = new McpServer({ name: 'resources-test', version: '1' });
  registerResourceTools(server, manager);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try { return await client.callTool({ name, arguments: args }); }
  finally { await client.close(); await server.close(); }
}
const payload = (result: Awaited<ReturnType<typeof run>>) => JSON.parse((result.content as Array<{ text: string }>)[0].text);

describe('consolidated resource tools', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(comfyui.isComfyUIConfigured).mockReturnValue(true); });

  it('filters model filenames and reports missing models', async () => {
    const manager = new ModelManager({ getObjectInfo: async () => ({}) });
    vi.spyOn(manager, 'listModels').mockResolvedValue([{ name: 'a.safetensors', type: 'checkpoint' }]);
    expect(payload(await run('list_models', { name: 'missing' }, manager))).toEqual({ found: false, models: [] });
    expect(payload(await run('list_models', { name: 'a.safetensors' }, manager)).models).toHaveLength(1);
  });

  it('extracts model requirements offline and only queries availability on request', async () => {
    vi.mocked(comfyui.isComfyUIConfigured).mockReturnValue(false);
    const workflow = JSON.stringify({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'a.safetensors' } } });
    const result = payload(await run('get_workflow_models', { workflow }));
    expect(result.required[0].name).toBe('a.safetensors');
    expect((await run('get_workflow_models', { workflow, check_availability: true })).isError).toBe(true);
  });

  it('requires exactly one output selector', async () => {
    expect((await run('list_outputs', {})).isError).toBe(true);
    expect((await run('list_outputs', { prompt_id: 'p', selector: 'latest_image' })).isError).toBe(true);
    expect(outputs.listOutputs).not.toHaveBeenCalled();
  });

  it('finds the latest image-producing prompt', async () => {
    vi.mocked(comfyui.getHistory).mockResolvedValue([{ prompt_id: 'empty', outputs: {} }, { prompt_id: 'image', outputs: {} }]);
    vi.mocked(comfyui.getFirstOutputImageRef).mockImplementation(([entry]) => entry.prompt_id === 'image' ? { filename: 'a.png' } : null);
    vi.mocked(outputs.listOutputs).mockResolvedValue([]);
    expect(payload(await run('list_outputs', { selector: 'latest_image' }))).toEqual({ prompt_id: 'image', files: [] });
    expect(outputs.listOutputs).toHaveBeenCalledWith('image');
  });

  it('rejects incompatible download destinations before IO', async () => {
    expect((await run('download_outputs', { source: { kind: 'prompt', prompt_id: 'p' }, destination: { kind: 'base64' } })).isError).toBe(true);
    expect((await run('download_outputs', { source: { kind: 'file', filename: 'a.png' }, destination: { kind: 'directory', path: '/tmp/out' } })).isError).toBe(true);
    expect(outputs.downloadByFilename).not.toHaveBeenCalled();
    expect(outputs.downloadAllOutputs).not.toHaveBeenCalled();
  });

  it('returns base64 without requiring a disk path', async () => {
    vi.mocked(outputs.downloadByFilename).mockResolvedValue({ base64: 'abc', mimeType: 'image/png' } as never);
    await run('download_outputs', { source: { kind: 'file', filename: 'a.png' }, destination: { kind: 'base64', max_bytes: 0 } });
    expect(outputs.downloadByFilename).toHaveBeenCalledWith('a.png', '', expect.objectContaining({ returnBase64: true, max_base64_bytes: 0 }));
  });

  it('checks prompt ownership before downloading a file', async () => {
    vi.mocked(outputs.listOutputs).mockResolvedValue([]);
    const result = await run('download_outputs', { source: { kind: 'file', filename: 'a.png', prompt_id: 'p' }, destination: { kind: 'file', path: '/tmp/a.png' } });
    expect(result.isError).toBe(true);
    expect(outputs.downloadByFilename).not.toHaveBeenCalled();
  });

  it('preserves temporary storage metadata for verified prompt files', async () => {
    vi.mocked(outputs.listOutputs).mockResolvedValue([{ prompt_id: 'p', node_id: '1', filename: 'a.png', subfolder: '', type: 'image', url: 'http://localhost:8188/view?filename=a.png&type=temp' }]);
    await run('download_outputs', { source: { kind: 'file', filename: 'a.png', prompt_id: 'p' }, destination: { kind: 'file', path: '/tmp/a.png' } });
    expect(outputs.downloadByFilename).toHaveBeenCalledWith('a.png', '/tmp/a.png', expect.objectContaining({ type: 'temp' }));
  });

  it('returns conservative offline recommendations and labels filename inference', async () => {
    vi.mocked(comfyui.isComfyUIConfigured).mockReturnValue(false);
    const result = payload(await run('get_generation_recommendations', { checkpoint: 'flux1.safetensors', prompt: 'a sign that says Hello' }));
    expect(result.resources).toBeNull();
    expect(result.warnings).not.toHaveLength(0);
    expect(result.text_in_image_advice).toBeTruthy();
    expect(result.template_suggestion).toMatchObject({ heuristic: true, template: 'txt2img_flux' });
  });
});
