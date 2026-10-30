import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HybridNodeDiscovery } from '../node-discovery/hybrid-discovery.js';

/** Register node lookup tools against the server's configured discovery instance. */
export function registerNodeTools(server: McpServer, getDiscovery: () => HybridNodeDiscovery | null): void {
  server.registerTool('search_nodes', {
    description: 'Find ComfyUI node classes by query, task, or port types. source=local browses the offline knowledge base; live lists only installed nodes and fails if ComfyUI is unavailable; merged prefers live definitions with local fallback. Results identify their source. Use get_node_info to inspect a selected class.',
    inputSchema: {
      source: z.enum(['local', 'live', 'merged']).default('merged').describe('Node inventory to search; local never contacts ComfyUI, live never falls back.'),
      query: z.string().optional().describe('Substring in class name, display name, description, or category; omit to browse.'),
      task: z.string().optional().describe('Substring in description, display name, or local use cases (e.g. load checkpoint).'),
      category: z.string().optional().describe('Exact category, case insensitive.'),
      priority: z.enum(['high', 'medium', 'low']).optional().describe('Knowledge-base priority; excludes nodes without local priority metadata.'),
      input_type: z.string().optional().describe('Consumed port type, e.g. MODEL.'),
      output_type: z.string().optional().describe('Produced port type, e.g. IMAGE.'),
      limit: z.number().int().min(1).max(1000).default(100).describe('Maximum returned matches; total reports the full matching count.'),
      offset: z.number().int().min(0).default(0).describe('Number of matching nodes to skip for pagination.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ source, query, task, category, priority, input_type, output_type, limit, offset }) => {
    try {
      const discovery = getDiscovery();
      if (!discovery) throw new Error('Node discovery not initialized.');
      const nodes = await discovery.searchNodes(query ?? '', { task, category, priority, input_type, output_type }, source);
      return { content: [{ type: 'text', text: JSON.stringify({ total: nodes.length, offset, nodes: nodes.slice(offset, offset + limit) }, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });

  server.registerTool('get_node_info', {
    description: 'Inspect one ComfyUI node class with live-first, local fallback lookup. section=all returns the normalized definition; inputs returns required/optional ports; outputs returns output types/names. Port views include class_name and source. Find a class name with search_nodes first.',
    inputSchema: {
      node_name: z.string().min(1).describe('Exact node class name, e.g. KSampler.'),
      section: z.enum(['all', 'inputs', 'outputs']).default('all').describe('Part of the definition to return.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ node_name, section }) => {
    try {
      const discovery = getDiscovery();
      if (!discovery) throw new Error('Node discovery not initialized.');
      const node = await discovery.getNode(node_name);
      if (!node) throw new Error(`Node "${node_name}" not found in live ComfyUI or knowledge base.`);
      const payload = section === 'inputs'
        ? { class_name: node.class_name, source: node.source, required: node.input.required ?? {}, optional: node.input.optional ?? {} }
        : section === 'outputs'
          ? { class_name: node.class_name, source: node.source, output: node.output, output_name: node.output_name }
          : node;
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
}
