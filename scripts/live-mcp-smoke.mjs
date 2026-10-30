#!/usr/bin/env node
/**
 * Live, checkpoint-free MCP smoke test against an already-running ComfyUI.
 * Build first: npm run build
 * COMFYUI_HOST=http://127.0.0.1:8188 node scripts/live-mcp-smoke.mjs
 * Optional on a dedicated empty instance: LIVE_MCP_QUEUE_CONTROL=1
 * Administrative mutations are separately opt-in: LIVE_MCP_ADMIN=1, plus
 * LIVE_MCP_INSTALL_NODE_NAMES / LIVE_MCP_INSTALL_MODEL_URL when desired.
 * Artifacts and isolated knowledge/workflow/plugin files remain in a temp dir.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.COMFYUI_HOST;
if (!host) throw new Error('COMFYUI_HOST must point to an already-running ComfyUI instance.');
const work = await mkdtemp(join(tmpdir(), 'comfy-mcp-live-'));
const knowledge = join(work, 'knowledge');
const reportPath = process.env.LIVE_MCP_REPORT ? resolve(process.env.LIVE_MCP_REPORT) : join(work, 'report.json');
const steps = [];
const prefix = `mcp_smoke_${Date.now()}`;
const timeout = Number(process.env.LIVE_MCP_TIMEOUT_MS ?? 60000);
let toolNames = [];
let stderr = '';
await mkdir(knowledge, { recursive: true });
await mkdir(join(work, 'plugins', 'smoke'), { recursive: true });
await copyFile(join(root, 'knowledge', 'seed-base-nodes.json'), join(knowledge, 'base-nodes.json'));
await copyFile(join(root, 'knowledge', 'seed-node-compatibility.json'), join(knowledge, 'node-compatibility.json'));
await writeFile(join(work, 'plugins', 'smoke', 'plugin.json'), JSON.stringify({
  id: 'smoke', name: 'Smoke fixture', version: '1.0.0', macros: [{
    id: 'blank', name: 'Blank image', description: 'Checkpoint-free image source', inputs: [],
    outputs: [{ name: 'image', type: 'IMAGE', nodeId: '1', outputIndex: 0 }],
    nodes: { '1': { class_type: 'EmptyImage', inputs: { width: 64, height: 64, batch_size: 1, color: 255 } } },
  }],
}));

const transport = new StdioClientTransport({
  command: process.execPath, args: [join(root, 'dist', 'mcp-server.js')], cwd: work,
  env: { ...process.env, COMFYUI_HOST: host, COMFYUI_KNOWLEDGE_DIR: knowledge }, stderr: 'pipe',
});
const client = new Client({ name: 'comfy-live-smoke', version: '1.0.0' });

function decode(result) {
  const text = (result.content ?? []).filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  // Plain numeric node IDs are text results, not JSON numbers.
  if (!/^[\[{]/.test(text.trim())) return text;
  try { return JSON.parse(text); } catch { return text; }
}
function compact(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (key === 'base64' || key === 'data') && typeof item === 'string' ? `[${item.length} encoded characters]` : item));
}
async function run(tool, args = {}, check = () => {}, scenario = tool, expectedError = false) {
  const start = Date.now();
  try {
    const requestTimeout = tool === 'install_custom_node' ? Math.max(timeout + 30000, 330000) : timeout + 30000;
    const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: requestTimeout });
    const value = decode(result);
    if (expectedError) assert.equal(result.isError, true, 'Expected an MCP error result');
    else assert.notEqual(result.isError, true, JSON.stringify(value));
    await check(value, result);
    steps.push({ tool, scenario, status: 'passed', expected_error: expectedError, elapsed_ms: Date.now() - start, result: compact(value) });
    console.log(`PASS ${scenario}`);
    return value;
  } catch (error) {
    steps.push({ tool, scenario, status: 'failed', elapsed_ms: Date.now() - start, error: error.stack ?? String(error) });
    console.error(`FAIL ${scenario}: ${error.message}`);
    return undefined;
  }
}
function skip(tool, reason) {
  steps.push({ tool, scenario: tool, status: 'skipped', reason });
  console.log(`SKIP ${tool}: ${reason}`);
}
const blank = (suffix) => ({
  '1': { class_type: 'EmptyImage', inputs: { width: 64, height: 64, batch_size: 1, color: 255 } },
  '2': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: `${prefix}_${suffix}` } },
});
const scaled = (suffix, image = '__replaced_by_chain__.png') => ({
  '1': { class_type: 'LoadImage', inputs: { image } },
  '2': { class_type: 'ImageScale', inputs: { image: ['1', 0], upscale_method: 'nearest-exact', width: 32, height: 32, crop: 'disabled' } },
  '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: `${prefix}_${suffix}` } },
});
const completed = (value) => { assert.equal(value.status, 'completed', JSON.stringify(value)); assert.ok(value.prompt_id); assert.ok(Object.keys(value.outputs ?? {}).length); };

try {
  await client.connect(transport);
  transport.stderr?.on('data', (data) => { stderr += data.toString(); });
  toolNames = (await client.listTools()).tools.map((tool) => tool.name);
  assert.equal(new Set(toolNames).size, toolNames.length);
  console.log(`Connected to MCP: ${toolNames.length} tools; work directory ${work}`);

  await run('sync_nodes_to_knowledge', {}, (value) => assert.match(String(value), /Added:/));
  for (const source of ['live', 'local', 'merged']) await run('search_nodes', { source, query: 'EmptyImage', limit: 2 }, (value) => {
    assert.ok(value.total >= 1); assert.ok(value.nodes.some((node) => node.class_name === 'EmptyImage'));
  }, `search_nodes:${source}`);
  for (const section of ['all', 'inputs', 'outputs']) await run('get_node_info', { node_name: 'EmptyImage', section }, (value) => assert.equal(value.class_name, 'EmptyImage'), `get_node_info:${section}`);
  await run('list_node_categories', {}, (value) => assert.ok(String(value).length));
  await run('check_compatibility', { from_node: 'EmptyImage', to_node: 'SaveImage' }, (value) => assert.match(String(value), /Compatible:/));
  await run('list_templates', {}, (value) => assert.match(String(value), /txt2img/));
  await run('build_workflow', { template: 'txt2img', params: { prompt: 'smoke test', width: 64, height: 64 } }, (value) => assert.ok(Object.values(value).some((node) => node.class_type === 'KSampler')));
  await run('get_generation_recommendations', { checkpoint: 'flux1-example.safetensors', prompt: 'a sign with letters' }, (value) => {
    assert.ok(value.resources); assert.ok(value.recommendations); assert.equal(value.template_suggestion.heuristic, true);
  });
  await run('list_models', {}, (value) => assert.ok(Array.isArray(value.models)));
  await run('get_workflow_models', { workflow: JSON.stringify(blank('models')), check_availability: true }, (value) => { assert.equal(value.ready, true); assert.deepEqual(value.required, []); });
  await run('list_plugins', {}, (value) => assert.ok(Array.isArray(value) && value.some((plugin) => plugin.id === 'smoke')));
  await run('reload_plugins', {}, (value) => assert.match(String(value), /Reloaded plugins: 1/));
  await run('list_macros', {}, (value) => assert.match(String(value), /smoke:blank/));

  const workflowId = await run('create_workflow', {}, (value) => assert.equal(typeof value, 'string'));
  let exported;
  if (workflowId) {
    const sourceId = await run('add_node', { workflow_id: workflowId, class_type: 'EmptyImage', inputs: { width: 64, height: 64, batch_size: 1, color: 255 } }, (value) => assert.equal(typeof value, 'string'));
    const outputId = await run('add_node', { workflow_id: workflowId, class_type: 'SaveImage', inputs: { filename_prefix: `${prefix}_dynamic` } });
    await run('set_node_input', { workflow_id: workflowId, node_id: outputId, input_name: 'images', connection: { node_id: sourceId, output_index: 0 } }, (value) => assert.equal(value, 'ok'), 'set_node_input:connection');
    await run('set_node_input', { workflow_id: workflowId, node_id: sourceId, input_name: 'color', value: 65280 }, (value) => assert.equal(value, 'ok'), 'set_node_input:literal');
    const inserted = await run('insert_macro', { workflow_id: workflowId, macro_id: 'smoke:blank', input_connections: {} }, (value) => assert.ok(value.nodeIdMap));
    const macroNode = inserted?.nodeIdMap?.['1'];
    if (macroNode) await run('remove_node', { workflow_id: workflowId, node_id: macroNode }, (value) => assert.equal(value, 'ok'));
    await run('validate_workflow', { workflow_id: workflowId }, (value) => assert.equal(value, 'valid'));
    exported = await run('get_workflow_json', { workflow_id: workflowId }, (value) => assert.equal(value[outputId].class_type, 'SaveImage'));
  }
  const workflow = exported ?? blank('fallback');
  const savedName = `${prefix}_saved`;
  await run('save_workflow', { name: savedName, workflow: JSON.stringify(workflow) }, async (value) => { assert.match(String(value), /Saved to/); assert.ok((await stat(join(work, 'workflows', `${savedName}.json`))).size > 0); });
  await run('list_saved_workflows', {}, (value) => assert.ok(String(value).includes(savedName)));
  await run('load_workflow', { name_or_path: savedName }, (value) => assert.deepEqual(value, workflow));
  const custom = await run('create_template', { workflow: JSON.stringify(workflow), name: 'Smoke template', params: [{ name: 'color', type: 'number', required: true, default: 255, nodeBindings: [{ nodeId: '1', inputName: 'color' }] }] }, (value) => assert.equal(value.name, 'Smoke template'));
  if (custom) {
    await run('apply_template', { template: JSON.stringify(custom), values: {}, validate_only: true }, (value) => assert.equal(value.valid, true), 'apply_template:validate_defaults');
    await run('apply_template', { template: JSON.stringify(custom), values: { color: 16711680 } }, (value) => assert.equal(value['1'].inputs.color, 16711680), 'apply_template:instantiate');
  }

  const first = await run('execute_workflow', { workflow: JSON.stringify(workflow), timeout_ms: timeout, progress_transport: 'polling' }, completed, 'execute_workflow:polling');
  await run('execute_workflow', { workflow: JSON.stringify(blank('auto')), timeout_ms: timeout, include_events: true }, (value) => { completed(value); assert.ok(Array.isArray(value.events)); }, 'execute_workflow:auto_events');
  await run('execute_workflow', { workflow: JSON.stringify(blank('websocket')), timeout_ms: timeout, progress_transport: 'websocket', include_events: true }, completed, 'execute_workflow:websocket');
  const queued = await run('execute_workflow', { workflow: JSON.stringify(blank('queued')), wait: false }, (value) => { assert.equal(value.status, 'queued'); assert.ok(value.prompt_id); }, 'execute_workflow:submit_only');
  if (queued?.prompt_id) await run('get_execution', { prompt_id: queued.prompt_id, view: 'progress' }, (value) => assert.ok(value.status), 'get_execution:progress');
  if (first?.prompt_id) {
    for (const view of ['summary', 'errors']) await run('get_execution', { prompt_id: first.prompt_id, view }, (value) => assert.equal(value.prompt_id, first.prompt_id), `get_execution:${view}`);
    const files = await run('list_outputs', { prompt_id: first.prompt_id }, (value) => assert.ok(value.files.length > 0), 'list_outputs:prompt');
    await run('list_outputs', { selector: 'latest_image' }, (value) => assert.ok(value.files.length > 0), 'list_outputs:latest_image');
    const file = files?.files?.[0];
    if (file) {
      const destination = join(work, 'downloads', 'one.png');
      const source = { kind: 'file', filename: file.filename, subfolder: file.subfolder, prompt_id: first.prompt_id, node_id: file.node_id };
      await run('download_outputs', { source, destination: { kind: 'file', path: destination } }, async () => {
        const bytes = await readFile(destination); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        assert.equal(bytes.readUInt32BE(16), 64); assert.equal(bytes.readUInt32BE(20), 64);
      }, 'download_outputs:file');
      await run('download_outputs', { source, destination: { kind: 'base64', max_bytes: 0 } }, (value) => { assert.equal(value.encoding, 'base64'); assert.ok(value.data); assert.ok(Buffer.from(value.data, 'base64').length > 0); }, 'download_outputs:base64');
      await run('download_outputs', { source: { kind: 'prompt', prompt_id: first.prompt_id }, destination: { kind: 'directory', path: join(work, 'downloads', 'all') } }, (value) => assert.ok(value.paths.length > 0), 'download_outputs:all');
    }
    await run('prepare_image_for_workflow', { prompt_id: first.prompt_id }, (value) => assert.match(String(value), /Image uploaded to input/));
  }
  await run('get_history', { limit: 5 }, (value) => assert.ok(Array.isArray(value) && value.length > 0));
  await run('execute_batch', { workflows: [JSON.stringify(blank('batch_a')), JSON.stringify(blank('batch_b'))], concurrency: 2, stop_on_error: true, timeout_ms: timeout }, (value) => { assert.equal(value.length, 2); value.forEach(completed); });
  const chain = await run('execute_chain', { steps: [{ workflow: blank('chain_source') }, { workflow: scaled('chain_scaled'), inputFrom: { step: 0, outputNode: '2', outputIndex: 0 }, outputTo: 'image' }], stop_on_error: true, timeout_ms: timeout }, (value) => { assert.equal(value.length, 2); value.forEach(completed); });
  if (chain?.[1]?.status === 'completed') {
    const files = await run('list_outputs', { prompt_id: chain[1].prompt_id }, (value) => assert.ok(value.files.length), 'list_outputs:chain_result');
    const file = files?.files?.[0];
    if (file) await run('download_outputs', { source: { kind: 'file', filename: file.filename, subfolder: file.subfolder, prompt_id: chain[1].prompt_id }, destination: { kind: 'file', path: join(work, 'downloads', 'scaled.png') } }, async () => {
      const bytes = await readFile(join(work, 'downloads', 'scaled.png'));
      assert.equal(bytes.readUInt32BE(16), 32); assert.equal(bytes.readUInt32BE(20), 32);
    }, 'download_outputs:verify_chain_dimensions');
  }

  await run('execute_workflow', { workflow: JSON.stringify({ '1': { class_type: 'SaveImage', inputs: { images: ['missing', 0] } } }), wait: false }, () => {}, 'execute_workflow:reject_dangling_reference', true);
  await run('execute_workflow', { workflow: JSON.stringify(blank('invalid')), wait: false, include_events: true }, () => {}, 'execute_workflow:reject_conflicting_options', true);
  await run('download_outputs', { source: { kind: 'prompt', prompt_id: 'invalid' }, destination: { kind: 'base64' } }, () => {}, 'download_outputs:reject_invalid_combination', true);
  await run('get_node_info', { node_name: '__missing_smoke_node__' }, () => {}, 'get_node_info:missing', true);
  const queue = await run('list_queue', {}, (value) => { assert.ok(Array.isArray(value.queue_running)); assert.ok(Array.isArray(value.queue_pending)); });
  if (process.env.LIVE_MCP_QUEUE_CONTROL === '1' && queue?.queue_running?.length === 0 && queue?.queue_pending?.length === 0) {
    await run('delete_queue_items', { prompt_ids: [`${prefix}_nonexistent`] }, (value) => assert.match(String(value), /Removed from queue/));
    await run('interrupt_execution', { prompt_id: `${prefix}_nonexistent` }, (value) => assert.match(String(value), /Interrupt sent/));
    await run('clear_queue', {}, (value) => assert.match(String(value), /Queue cleared/));
  } else for (const name of ['delete_queue_items', 'interrupt_execution', 'clear_queue']) skip(name, 'Queue mutation requires LIVE_MCP_QUEUE_CONTROL=1 and an empty dedicated instance.');

  if (process.env.LIVE_MCP_ADMIN === '1') {
    if (process.env.COMFYUI_PATH) await run('reload_comfyui', { wait_for_ready: true, sync_after_restart: true, wait_timeout_ms: timeout }, (value) => assert.doesNotMatch(String(value), /failed/i));
    else skip('reload_comfyui', 'COMFYUI_PATH is not set.');
    const nodeNames = process.env.LIVE_MCP_INSTALL_NODE_NAMES?.split(',').filter(Boolean);
    if (nodeNames?.length) await run('install_custom_node', { node_names: nodeNames }, (value) => assert.match(String(value), /Install completed/));
    else skip('install_custom_node', 'Set LIVE_MCP_INSTALL_NODE_NAMES to explicit packs to install.');
    if (process.env.LIVE_MCP_INSTALL_MODEL_URL) await run('install_model', { url: process.env.LIVE_MCP_INSTALL_MODEL_URL, model_type: process.env.LIVE_MCP_INSTALL_MODEL_TYPE ?? 'checkpoint' }, (value) => assert.doesNotMatch(String(value), /failed/i));
    else skip('install_model', 'Set LIVE_MCP_INSTALL_MODEL_URL to an explicit model download.');
  } else for (const name of ['reload_comfyui', 'install_custom_node', 'install_model']) skip(name, 'Administrative mutation excluded; set LIVE_MCP_ADMIN=1 to opt in.');
} catch (error) {
  steps.push({ tool: '__harness__', scenario: 'initialization', status: 'failed', error: error.stack ?? String(error) });
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
  for (const name of toolNames) if (!steps.some((step) => step.tool === name)) skip(name, 'Not reached because a prerequisite failed.');
  const coverage = Object.fromEntries(toolNames.map((name) => {
    const entries = steps.filter((step) => step.tool === name);
    return [name, entries.some((entry) => entry.status === 'failed') ? 'failed' : entries.some((entry) => entry.status === 'passed' && !entry.expected_error) ? 'passed' : 'skipped'];
  }));
  const summary = Object.values(coverage).reduce((counts, status) => ({ ...counts, [status]: counts[status] + 1 }), { passed: 0, failed: 0, skipped: 0 });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ started_for_host: host, generated_at: new Date().toISOString(), work_directory: work, tool_count: toolNames.length, summary, coverage, steps, server_stderr: stderr }, null, 2));
  console.log(`Report: ${reportPath}\nTool coverage: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
  if (steps.some((step) => step.status === 'failed')) process.exitCode = 1;
}
