import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HybridNodeDiscovery } from '../src/node-discovery/hybrid-discovery.js';
import { registerNodeTools } from '../src/tools/node-tools.js';

describe('consolidated node tools', () => {
  it('advertises only consolidated tools and serves node sections and strict live errors', async () => {
    const discovery = new HybridNodeDiscovery({
      getObjectInfo: async () => { throw new Error('offline'); },
      loadBaseNodes: () => ({ metadata: {}, nodes: {
        Example: {
          display_name: 'Example', category: 'testing', description: 'Example node',
          input_types: { required: { text: { type: 'STRING' } } },
          return_types: ['IMAGE'], return_names: ['image'], output_colors: [],
          use_cases: ['render a picture'], compatible_outputs: {}, example_values: {}, priority: 'high',
        },
      } }),
    });
    const server = new McpServer({ name: 'node-test', version: '1' });
    registerNodeTools(server, () => discovery);
    const client = new Client({ name: 'test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
    const json = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as Array<{ text: string }>)[0].text);
    try {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['search_nodes', 'get_node_info']);
      const found = json(await call('search_nodes', { source: 'local', task: 'render a picture', priority: 'high' }));
      expect(found.total).toBe(1);
      expect(found.nodes[0].class_name).toBe('Example');
      expect(json(await call('search_nodes', { source: 'local', offset: 1 })).nodes).toEqual([]);
      expect((await call('search_nodes', { source: 'live' })).isError).toBe(true);
      const inputs = json(await call('get_node_info', { node_name: 'Example', section: 'inputs' }));
      expect(inputs.required.text).toEqual(['STRING', {}]);
      expect(inputs.output).toBeUndefined();
      const outputs = json(await call('get_node_info', { node_name: 'Example', section: 'outputs' }));
      expect(outputs.output).toEqual(['IMAGE']);
      expect(outputs.required).toBeUndefined();
      expect(json(await call('get_node_info', { node_name: 'Example' })).description).toBe('Example node');
      expect((await call('get_node_info', { node_name: 'Missing' })).isError).toBe(true);
      expect((await call('get_node_info', { node_name: 'Example', section: 'invalid' })).isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
