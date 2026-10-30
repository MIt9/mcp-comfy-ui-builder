import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('MCP public tool surface', () => {
  it('exports workflow JSON without exposing the removed alias', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'mcp-package-cwd-'));
    const { COMFYUI_KNOWLEDGE_DIR: ignoredKnowledgeDir, ...env } = process.env;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', join(root, 'node_modules/tsx/dist/loader.mjs'), join(root, 'src/mcp-server.ts')],
      cwd,
      env: { ...env, COMFYUI_HOST: '' } as Record<string, string>,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'tool-surface-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.version).toBe(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(40);
      const removedNames = ['finalize_workflow', 'list_node_types', 'suggest_nodes', 'discover_nodes_live', 'get_node_inputs', 'get_node_outputs', 'build_restyle_workflow', 'suggest_template_for_checkpoint', 'connect_nodes', 'execute_workflow_sync', 'execute_workflow_stream', 'get_execution_status', 'get_execution_progress', 'get_error_details', 'get_last_output', 'download_output', 'download_by_filename', 'download_all_outputs', 'get_model_info', 'check_model_exists', 'check_workflow_models', 'get_system_resources', 'validate_template_params'];
      expect(tools.filter((tool) => removedNames.includes(tool.name))).toEqual([]);
      for (const tool of tools) {
        for (const name of removedNames) expect(tool.description).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
      expect(tools.some((tool) => tool.name === 'get_workflow_json')).toBe(true);
      const created = await client.callTool({ name: 'create_workflow', arguments: {} });
      const workflowId = (created.content as Array<{ text: string }>)[0].text;
      const args = { workflow_id: workflowId };
      const exported = await client.callTool({ name: 'get_workflow_json', arguments: args });
      expect((exported.content as Array<{ text: string }>)[0].text).toBe('{}');
      const removed = await client.callTool({ name: 'finalize_workflow', arguments: args });
      expect(removed.isError).toBe(true);
      const searched = await client.callTool({ name: 'search_nodes', arguments: { source: 'local', query: 'KSampler' } });
      const searchResult = JSON.parse((searched.content as Array<{ text: string }>)[0].text);
      expect(searchResult.nodes.some((node: { class_name: string }) => node.class_name === 'KSampler')).toBe(true);
      const ports = await client.callTool({ name: 'get_node_info', arguments: { node_name: 'KSampler', section: 'inputs' } });
      expect(ports.isError).not.toBe(true);
    } finally {
      await client.close();
      await transport.close();
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15_000);
});
