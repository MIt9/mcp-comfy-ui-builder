import { afterEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerWorkflowTools, setNodeInputSchema } from '../src/tools/workflow-tools.js';
import { WorkflowStore } from '../src/workflow/workflow-store.js';
import { addNode } from '../src/workflow/dynamic-builder.js';
import { createTemplate } from '../src/workflow/workflow-template.js';
import type { ComfyUINodeDef, SystemStatsResponse } from '../src/types/comfyui-api-types.js';

const clients: Client[] = [];
const servers: McpServer[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function setup(options: Parameters<typeof registerWorkflowTools>[1] = {}) {
  const server = new McpServer({ name: 'test-workflow-tools', version: '1.0.0' });
  const store = new WorkflowStore();
  registerWorkflowTools(server, { store, isComfyUIConfigured: () => false, ...options });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  servers.push(server);
  clients.push(client);
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, store };
}

function payload(result: Awaited<ReturnType<Client['callTool']>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}

describe('consolidated workflow tools', () => {
  it('requires exactly one literal or connection and rejects references disguised as literals', () => {
    const base = { workflow_id: 'wf', node_id: '2', input_name: 'image' };
    expect(setNodeInputSchema.safeParse(base).success).toBe(false);
    expect(setNodeInputSchema.safeParse({ ...base, value: false }).success).toBe(true);
    expect(setNodeInputSchema.safeParse({ ...base, value: 0, connection: { node_id: '1', output_index: 0 } }).success).toBe(false);
    expect(setNodeInputSchema.safeParse({ ...base, value: ['missing', 0] }).success).toBe(false);
    expect(setNodeInputSchema.safeParse({ ...base, connection: { node_id: '1', output_index: -1 } }).success).toBe(false);
  });

  it('sets values and connections, rejecting missing source nodes without mutation', async () => {
    const { client, store } = await setup();
    const workflow_id = store.create();
    const ctx = store.get(workflow_id)!;
    addNode(ctx, 'Source');
    addNode(ctx, 'Target');
    const base = { workflow_id, node_id: '2', input_name: 'image' };
    await client.callTool({ name: 'set_node_input', arguments: { ...base, connection: { node_id: '1', output_index: 0 } } });
    expect(ctx.workflow['2'].inputs.image).toEqual(['1', 0]);
    const failed = await client.callTool({ name: 'set_node_input', arguments: { ...base, connection: { node_id: 'missing', output_index: 0 } } });
    expect(failed.isError).toBe(true);
    expect(ctx.workflow['2'].inputs.image).toEqual(['1', 0]);
    await client.callTool({ name: 'set_node_input', arguments: { ...base, value: 'input.png' } });
    expect(ctx.workflow['2'].inputs.image).toBe('input.png');
  });

  it('builds normal presets and restyle with a reproducible recipe, rejecting invalid restyle params', async () => {
    const { client } = await setup();
    const normal = payload(await client.callTool({ name: 'build_workflow', arguments: { template: 'txt2img', params: { prompt: 'a tree' } } }));
    expect(Object.values(normal as Record<string, ComfyUINodeDef>).some((node) => node.inputs.text === 'a tree')).toBe(true);
    const restyle = payload(await client.callTool({ name: 'build_workflow', arguments: { template: 'restyle', params: { image: 'input.png', style: 'anime', seed: 42 } } }));
    expect(restyle.workflow).toBeDefined();
    expect(restyle.recipe).toBeDefined();
    const invalid = await client.callTool({ name: 'build_workflow', arguments: { template: 'restyle', params: { image: 'input.png', style: 'anime', denoise: 2 } } });
    expect(invalid.isError).toBe(true);
  });

  it('retains the FLUX resource and resolution guards', async () => {
    const stats: SystemStatsResponse = { system: { ram_total: 8 * 1024 ** 3, ram_free: 4 * 1024 ** 3 }, devices: [{ name: 'GPU', type: 'cuda', index: 0, vram_total: 4 * 1024 ** 3, vram_free: 3 * 1024 ** 3, torch_vram_total: 0, torch_vram_free: 0 }] };
    const { client } = await setup({ isComfyUIConfigured: () => true, getSystemStats: async () => stats });
    const result = await client.callTool({ name: 'build_workflow', arguments: { template: 'txt2img_flux' } });
    expect(result.isError).toBe(true);
    expect(payload(result).flux_ready).toBe(false);
    stats.devices![0].vram_total = 16 * 1024 ** 3;
    const oversized = await client.callTool({ name: 'build_workflow', arguments: { template: 'txt2img_flux', params: { width: 2048 } } });
    expect(oversized.isError).toBe(true);
    expect(payload(oversized).flux_max_width).toBe(1024);
  });

  it('validates custom values without applying and refuses invalid instantiation', async () => {
    const { client } = await setup();
    const template = createTemplate({ '1': { class_type: 'Text', inputs: { text: 'original' } } }, [{ name: 'prompt', type: 'string', required: true, nodeBindings: [{ nodeId: '1', inputName: 'text' }] }]);
    const args = { template: JSON.stringify(template), values: { prompt: 3 } };
    expect(payload(await client.callTool({ name: 'apply_template', arguments: { ...args, validate_only: true } })).valid).toBe(false);
    expect((await client.callTool({ name: 'apply_template', arguments: args })).isError).toBe(true);
    const applied = payload(await client.callTool({ name: 'apply_template', arguments: { ...args, values: { prompt: 'updated' } } }));
    expect(applied['1'].inputs.text).toBe('updated');
    expect(template.workflow['1'].inputs.text).toBe('original');
  });

  it('validates and applies required parameter defaults, rejecting invalid defaults', async () => {
    const { client } = await setup();
    const template = createTemplate({ '1': { class_type: 'Text', inputs: { text: 'original' } } }, [{ name: 'prompt', type: 'string', required: true, default: 'default text', nodeBindings: [{ nodeId: '1', inputName: 'text' }] }]);
    const args = { template: JSON.stringify(template), values: {} };
    expect(payload(await client.callTool({ name: 'apply_template', arguments: { ...args, validate_only: true } })).valid).toBe(true);
    expect(payload(await client.callTool({ name: 'apply_template', arguments: args }))['1'].inputs.text).toBe('default text');
    template.parameters[0].default = 42;
    const invalidArgs = { template: JSON.stringify(template), values: {} };
    expect(payload(await client.callTool({ name: 'apply_template', arguments: { ...invalidArgs, validate_only: true } })).valid).toBe(false);
    expect((await client.callTool({ name: 'apply_template', arguments: invalidArgs })).isError).toBe(true);
  });
});
