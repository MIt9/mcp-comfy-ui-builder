#!/usr/bin/env node
/**
 * MCP stdio server: node discovery, workflow assembly, execution, outputs,
 * model dependencies, reusable templates/macros, queue control, and installation.
 * Consolidated tool groups are registered from src/tools/.
 */
import { registerResourceTools } from './tools/resource-tools.js';
import { registerNodeTools } from './tools/node-tools.js';
import { registerWorkflowTools } from './tools/workflow-tools.js';
import { registerExecutionTools } from './tools/execution-tools.js';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BaseNodesJson, NodeCompatibilityData, NodeDescription } from './types/node-types.js';
import { listTemplates } from './workflow/workflow-builder.js';
import { saveWorkflow, listSavedWorkflows, loadWorkflow } from './workflow/workflow-storage.js';
import {
  addNode,
  removeNode,
  getWorkflow as getWorkflowFromContext,
  validateWorkflow as validateWorkflowContext,
} from './workflow/dynamic-builder.js';
import { getWorkflowStore } from './workflow/workflow-store.js';
import { setHybridDiscoveryOptions, getHybridDiscovery } from './node-discovery/hybrid-discovery.js';
import * as comfyui from './comfyui-client.js';
import * as managerCli from './manager-cli.js';
import { executeBatch } from './workflow/batch-executor.js';
import { ModelManager } from './model-manager.js';
import {
  createTemplate,
  type ParameterDefinition,
} from './workflow/workflow-template.js';
import { listMacros, getMacro, insertMacro as insertMacroIntoContext, registerPluginMacros } from './workflow/macro.js';
import { executeChain } from './workflow/chainer.js';
import type { ComfyUIWorkflow } from './types/comfyui-api-types.js';
import { loadPlugins, summarizePlugins, type LoadedPlugin } from './plugins/plugin-loader.js';

const KNOWLEDGE_DIR = process.env.COMFYUI_KNOWLEDGE_DIR?.trim() || fileURLToPath(new URL('../knowledge/', import.meta.url));
const BASE_NODES_PATH = join(KNOWLEDGE_DIR, 'base-nodes.json');
const COMPAT_PATH = join(KNOWLEDGE_DIR, 'node-compatibility.json');

// Cache for knowledge base with 5 minute TTL
const CACHE_TTL_MS = 5 * 60 * 1000;
let baseNodesCache: { data: BaseNodesJson; expires: number } | null = null;
let compatCache: { data: NodeCompatibilityData; expires: number } | null = null;

function invalidateBaseNodesCache(): void {
  baseNodesCache = null;
}

function loadBaseNodes(): BaseNodesJson {
  const now = Date.now();
  if (baseNodesCache && baseNodesCache.expires > now) {
    return baseNodesCache.data;
  }
  if (!existsSync(BASE_NODES_PATH)) {
    return { metadata: {}, nodes: {} };
  }
  const data = JSON.parse(readFileSync(BASE_NODES_PATH, 'utf8')) as BaseNodesJson;
  baseNodesCache = { data, expires: now + CACHE_TTL_MS };
  return data;
}

function loadCompatibility(): NodeCompatibilityData {
  const now = Date.now();
  if (compatCache && compatCache.expires > now) {
    return compatCache.data;
  }
  if (!existsSync(COMPAT_PATH)) {
    return { metadata: {}, data_types: {} };
  }
  const data = JSON.parse(readFileSync(COMPAT_PATH, 'utf8')) as NodeCompatibilityData;
  compatCache = { data, expires: now + CACHE_TTL_MS };
  return data;
}

// Initialize hybrid node discovery (live ComfyUI + knowledge base)
setHybridDiscoveryOptions({
  getObjectInfo: () => comfyui.getObjectInfo(),
  loadBaseNodes,
});

// Model manager (list/get/check models from object_info; workflow model analysis)
const modelManager = new ModelManager({ getObjectInfo: () => comfyui.getObjectInfo() });

// Plugins (templates/macros from plugins/*/plugin.json)
let loadedPlugins: LoadedPlugin[] = [];

function initPlugins(): void {
  loadedPlugins = loadPlugins();
  const allPluginMacros = loadedPlugins.flatMap((p) => p.macros);
  registerPluginMacros(allPluginMacros);
}

const server = new McpServer(
  { name: 'mcp-comfy-ui-builder', version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version },
  { capabilities: { tools: {} } }
);

// Load plugins at startup (safe no-op if plugins/ is absent)
initPlugins();
registerResourceTools(server, modelManager);
registerNodeTools(server, getHybridDiscovery);
registerWorkflowTools(server);
registerExecutionTools(server);

server.registerTool(
  'check_compatibility',
  {
    description: 'Check if output of one node can connect to input of another (using node-compatibility.json).',
    inputSchema: {
      from_node: z.string().describe('Source node class name'),
      to_node: z.string().describe('Target node class name'),
    },
  },
  (args) => {
    const base = loadBaseNodes();
    const compat = loadCompatibility();
    const fromDesc = (base.nodes ?? {})[args.from_node] as NodeDescription | undefined;
    const toDesc = (base.nodes ?? {})[args.to_node] as NodeDescription | undefined;
    if (!fromDesc || !toDesc) {
      return {
        content: [
          {
            type: 'text',
            text: `Missing node: ${!fromDesc ? args.from_node : args.to_node} not in knowledge base.`,
          },
        ],
      };
    }
    const outTypes = fromDesc.return_types ?? [];
    const requiredInputs = toDesc.input_types?.required ?? {};
    const toInputTypes = Object.values(requiredInputs).map((v: { type?: string }) => v?.type).filter(Boolean);
    const matches: string[] = [];
    for (const outType of outTypes) {
      const entry = compat.data_types?.[outType];
      const consumers = entry?.consumers ?? [];
      if (toInputTypes.includes(outType) && consumers.includes(args.to_node)) {
        matches.push(`${outType} (${args.from_node} → ${args.to_node})`);
      }
    }
    const text =
      matches.length > 0
        ? `Compatible: ${matches.join('; ')}`
        : `No direct type match found. From node outputs: ${outTypes.join(', ')}. To node consumes: ${toInputTypes.join(', ')}.`;
    return { content: [{ type: 'text', text }] };
  }
);

// --- Node Discovery (Phase 3): live ComfyUI + knowledge base ---

server.registerTool(
  'list_node_categories',
  {
    description: 'List all node categories from live ComfyUI and knowledge base (merged, unique).',
    inputSchema: {},
  },
  async () => {
    const hybrid = getHybridDiscovery();
    if (!hybrid) {
      return { content: [{ type: 'text', text: 'Node discovery not initialized.' }] };
    }
    try {
      const categories = await hybrid.listNodeCategories();
      const text = categories.length ? categories.join('\n') : 'No categories found.';
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `list_node_categories failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'sync_nodes_to_knowledge',
  {
    description:
      'Sync node definitions from running ComfyUI to the knowledge base. Adds only nodes that are not already in base-nodes.json. Creates knowledge/ if missing (or set COMFYUI_KNOWLEDGE_DIR to point to the knowledge directory). Requires ComfyUI to be running.',
    inputSchema: {},
  },
  async () => {
    const hybrid = getHybridDiscovery();
    if (!hybrid) {
      return { content: [{ type: 'text', text: 'Node discovery not initialized.' }] };
    }
    try {
      const result = await hybrid.syncToKnowledgeBase();
      invalidateBaseNodesCache();
      const lines = [
        `Added: ${result.added.length} node(s)`,
        result.added.length ? result.added.join(', ') : '',
        `Skipped (already in KB): ${result.skipped}`,
        result.errors.length ? `Errors: ${result.errors.join('; ')}` : '',
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `sync_nodes_to_knowledge failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'list_templates',
  {
    description: 'List named workflow presets accepted by build_workflow (e.g. txt2img). Works offline; does not list custom template JSON returned by create_template.',
    inputSchema: {},
  },
  () => {
    const list = listTemplates();
    return { content: [{ type: 'text', text: list.length ? list.join(', ') : 'No templates.' }] };
  }
);

// --- Dynamic workflow tools (Phase 2) ---
const workflowStore = getWorkflowStore();

server.registerTool(
  'create_workflow',
  {
    description:
      'Start manual node-by-node assembly of an empty in-memory workflow. Returns workflow_id for add_node, set_node_input, validate_workflow, and get_workflow_json. Export JSON before execution. Use build_workflow instead for a named preset.',
    inputSchema: {},
  },
  () => {
    const workflowId = workflowStore.create();
    workflowStore.cleanup(); // remove expired
    return { content: [{ type: 'text', text: workflowId }] };
  }
);

server.registerTool(
  'add_node',
  {
    description: 'Add a node to a dynamic workflow. Returns the new node id (e.g. "1", "2").',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
      class_type: z.string().describe('ComfyUI node class (e.g. CheckpointLoaderSimple, CLIPTextEncode)'),
      inputs: z.record(z.string(), z.unknown()).optional().describe('Node inputs (literal values; use set_node_input for links)'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    try {
      const nodeId = addNode(ctx, args.class_type, args.inputs ?? {});
      return { content: [{ type: 'text', text: nodeId }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `add_node failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'remove_node',
  {
    description: 'Remove a node from a dynamic workflow. Does not fix references (validation will report dangling refs).',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
      node_id: z.string().describe('Node id to remove'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    try {
      removeNode(ctx, args.node_id);
      return { content: [{ type: 'text', text: 'ok' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `remove_node failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_workflow_json',
  {
    description: 'Export a dynamic workflow_id as workflow JSON for execution or save_workflow. Leaves the context editable; does not validate, save, or execute it. Use validate_workflow to check references first.',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    const workflow = getWorkflowFromContext(ctx);
    const text = JSON.stringify(workflow, null, 2);
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'validate_workflow',
  {
    description: 'Validate a dynamic workflow: checks that all node references exist and output indices are valid.',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    const result = validateWorkflowContext(ctx);
    const text = result.valid
      ? 'valid'
      : `invalid:\n${result.errors.join('\n')}`;
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'execute_batch',
  {
    description:
      'Submit multiple independent workflow JSON documents and wait for their results, with bounded concurrency and optional stop on error. Use execute_chain when later workflows need earlier outputs, or execute_workflow for one workflow. Requires COMFYUI_HOST.',
    inputSchema: {
      workflows: z.array(z.string()).describe('Array of workflow JSON strings'),
      concurrency: z.number().int().min(1).optional().describe('Max workflows running at once (default 1)'),
      stop_on_error: z.boolean().optional().describe('Stop batch on first failure (default false)'),
      timeout_ms: z.number().int().min(1000).optional().describe('Per-workflow timeout in ms (default 300000)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use execute_batch.' }] };
    }
    const parsed: ComfyUIWorkflow[] = [];
    for (let i = 0; i < args.workflows.length; i++) {
      try {
        parsed.push(JSON.parse(args.workflows[i]) as ComfyUIWorkflow);
      } catch {
        return { content: [{ type: 'text', text: `Invalid workflow JSON at index ${i}.` }] };
      }
    }
    try {
      const results = await executeBatch({
        workflows: parsed,
        concurrency: args.concurrency ?? 1,
        stopOnError: args.stop_on_error ?? false,
        timeoutMs: args.timeout_ms ?? 300_000,
      });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `execute_batch failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_history',
  {
    description:
      'Get ComfyUI execution history (GET /history) without prompt_id. Returns last N prompts with prompt_id, status, outputs (filenames), elapsed. Use when execute_workflow did not return prompt_id (e.g. WebSocket timeout) to find the latest run and its outputs. Requires COMFYUI_HOST.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Number of recent history entries (default 5)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use get_history.' }] };
    }
    try {
      const entries = await comfyui.getHistory();
      const limit = args.limit ?? 5;
      const slice = entries.slice(0, limit).map((e) => ({
        prompt_id: e.prompt_id ?? '(unknown)',
        status: (e.status as { status_str?: string })?.status_str ?? 'unknown',
        outputs: e.outputs,
        elapsed: (e as { elapsed?: number[] }).elapsed,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(slice, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `get_history failed: ${msg}` }] };
    }
  }
);

// --- Model Management (Phase 5) ---

// --- Workflow Composition (Phase 6) ---
const parameterBindingSchema = z.object({
  nodeId: z.string(),
  inputName: z.string(),
});
const parameterDefinitionSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'array']),
  required: z.boolean(),
  default: z.unknown().optional(),
  options: z.array(z.unknown()).optional(),
  description: z.string().optional(),
  nodeBindings: z.array(parameterBindingSchema),
});

server.registerTool(
  'create_template',
  {
    description:
      'Convert existing workflow JSON into a custom parameterized template JSON using node input bindings. Returns the template without saving it or adding it to list_templates. Use apply_template to instantiate it; build_workflow uses named presets instead.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string'),
      params: z.array(parameterDefinitionSchema).describe('Parameter definitions with nodeBindings'),
      name: z.string().optional().describe('Template name'),
      description: z.string().optional().describe('Template description'),
      category: z.string().optional().describe('Template category'),
    },
  },
  (args) => {
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    try {
      const template = createTemplate(parsed, args.params as ParameterDefinition[], {
        name: args.name,
        description: args.description,
        category: args.category,
      });
      return { content: [{ type: 'text', text: JSON.stringify(template, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `create_template failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'list_macros',
  {
    description: 'List available workflow macros (built-in sub-workflows). Returns id, name, description, inputs, outputs.',
    inputSchema: {},
  },
  () => {
    const macros = listMacros();
    const text = macros.length
      ? macros.map((m) => `${m.id}: ${m.name} — ${m.description} (inputs: ${m.inputs.map((i) => i.name).join(', ')})`).join('\n')
      : 'No macros.';
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'insert_macro',
  {
    description:
      'Insert a macro (sub-workflow) into a dynamic workflow. Connects macro input ports to existing nodes. Returns nodeIdMap and outputPorts so you can connect macro outputs. Use workflow_id from create_workflow.',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
      macro_id: z.string().describe('Macro id (e.g. upscale_refine). Use list_macros to see available.'),
      input_connections: z
        .record(
          z.string(),
          z.union([z.tuple([z.string(), z.number()]), z.string(), z.number(), z.boolean()])
        )
        .describe('Map port name -> [source node id, output index] for links, or literal (e.g. filename for LoadImage)'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    const macro = getMacro(args.macro_id);
    if (!macro) {
      return { content: [{ type: 'text', text: `Macro "${args.macro_id}" not found. Use list_macros to see available.` }] };
    }
    try {
      const result = insertMacroIntoContext(ctx, macro, args.input_connections ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `insert_macro failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'execute_chain',
  {
    description:
      'Execute a chain of workflows in sequence. Each step runs after the previous completes. Use inputFrom and outputTo to pass the output image from one step to the next (e.g. txt2img → upscale → img2img). Steps can use workflow JSON or saved workflow name. Prefer saved workflow name (string) for large workflows to avoid ENAMETOOLONG in some clients. Requires COMFYUI_HOST.',
    inputSchema: {
      steps: z
        .array(
          z.object({
            workflow: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('Workflow JSON or saved name'),
            params: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe('Override node inputs: { nodeId: { inputName: value } }'),
            inputFrom: z
              .object({
                step: z.number().int().min(0),
                outputNode: z.string(),
                outputIndex: z.number().int().min(0).describe('Zero-based image index in the selected output node images array'),
              })
              .optional()
              .describe('Take image from this previous step'),
            outputTo: z.string().optional().describe('Input name in this workflow to set with image (e.g. image for LoadImage)'),
          })
        )
        .describe('Chain steps'),
      timeout_ms: z.number().int().min(1000).optional().describe('Per-step timeout (default 300000)'),
      stop_on_error: z.boolean().optional().describe('Stop chain on first failure (default false)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use execute_chain.' }] };
    }
    const steps = args.steps.map((s) => ({
      workflow: typeof s.workflow === 'string' ? s.workflow : (s.workflow as ComfyUIWorkflow),
      params: s.params,
      inputFrom: s.inputFrom,
      outputTo: s.outputTo,
    }));
    try {
      const results = await executeChain(steps, {
        timeoutMs: args.timeout_ms,
        stopOnError: args.stop_on_error,
      });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `execute_chain failed: ${msg}` }] };
    }
  }
);

// --- Plugin Management (Phase 7) ---

server.registerTool(
  'list_plugins',
  {
    description:
      'List loaded plugins (from plugins/*/plugin.json) and counts of macros/templates contributed by each.',
    inputSchema: {},
  },
  () => {
    const summary = summarizePlugins(loadedPlugins);
    const text = summary.length ? JSON.stringify(summary, null, 2) : 'No plugins loaded (plugins/ directory is empty or missing).';
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'reload_plugins',
  {
    description: 'Reload plugins from plugins/*/plugin.json and refresh macro registry.',
    inputSchema: {},
  },
  () => {
    try {
      initPlugins();
      const summary = summarizePlugins(loadedPlugins);
      const header = `Reloaded plugins: ${summary.length}`;
      const details = summary.length ? `\n${JSON.stringify(summary, null, 2)}` : '';
      return { content: [{ type: 'text', text: header + details }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `reload_plugins failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'reload_comfyui',
  {
    description:
      'Restart ComfyUI so that newly installed custom nodes are loaded, then optionally sync them to the knowledge base. Requires COMFYUI_PATH (ComfyUI installation directory) and uses COMFYUI_HOST for the port. Kills the process on the ComfyUI port and starts main.py from COMFYUI_PATH. After restart, call sync_nodes_to_knowledge to pick up custom nodes (or set sync_after_restart to true).',
    inputSchema: {
      wait_for_ready: z.boolean().optional().describe('Wait for ComfyUI to respond before returning. Default true.'),
      sync_after_restart: z.boolean().optional().describe('After restart, run sync_nodes_to_knowledge to update the knowledge base with custom nodes. Default true when wait_for_ready is true.'),
      wait_timeout_ms: z.number().optional().describe('Max ms to wait for ComfyUI ready. Default 120000.'),
    },
  },
  async (args) => {
    if (!managerCli.getComfyPath()) {
      return {
        content: [
          {
            type: 'text',
            text: 'COMFYUI_PATH is not set. Set it to your ComfyUI installation directory (e.g. /path/to/ComfyUI) to restart ComfyUI and reload custom nodes.',
          },
        ],
      };
    }
    const waitForReady = args.wait_for_ready !== false;
    const syncAfterRestart = args.sync_after_restart ?? waitForReady;
    const waitTimeoutMs = args.wait_timeout_ms ?? 120_000;
    try {
      const result = await managerCli.restartComfyUIAsync({
        waitForReady,
        waitTimeoutMs,
      });
      if (!result.ok) {
        return { content: [{ type: 'text', text: `reload_comfyui failed: ${result.message}` }] };
      }
      getHybridDiscovery()?.invalidateCache();
      modelManager.invalidateCache();
      invalidateBaseNodesCache();
      let text = result.message;
      if (syncAfterRestart && result.ready) {
        const hybrid = getHybridDiscovery();
        if (hybrid) {
          try {
            const syncResult = await hybrid.syncToKnowledgeBase();
            invalidateBaseNodesCache();
            text += `\nSync: added ${syncResult.added.length} node(s), skipped ${syncResult.skipped}.`;
            if (syncResult.errors.length) text += ` Errors: ${syncResult.errors.join('; ')}`;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            text += `\nSync failed: ${msg}`;
          }
        }
      } else if (syncAfterRestart && !result.ready) {
        text += '\nComfyUI did not become ready in time; call sync_nodes_to_knowledge manually when it is up.';
      }
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `reload_comfyui failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'prepare_image_for_workflow',
  {
    description:
      'Fetch the first output image from a completed prompt and upload it to ComfyUI input folder. Returns the filename to use in LoadImage for a follow-up workflow (e.g. image caption / verification). Use after get_execution confirms the prompt finished with image output. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id from execute_workflow (run must be completed with image output)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use prepare_image_for_workflow.',
          },
        ],
      };
    }
    try {
      const result = await comfyui.prepareImageForWorkflow(args.prompt_id);
      const nameForLoad = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
      const text = [
        `Image uploaded to input. Use in LoadImage:`,
        `  image: "${result.name}"`,
        result.subfolder ? `  (subfolder: ${result.subfolder})` : null,
        `LoadImage typically expects "image" = filename; if your ComfyUI uses subfolders, use: ${nameForLoad}`,
      ]
        .filter(Boolean)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `prepare_image_for_workflow failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'list_queue',
  {
    description: 'List current ComfyUI queue (running and pending prompts). Requires COMFYUI_HOST.',
    inputSchema: {},
  },
  async () => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use list_queue.',
          },
        ],
      };
    }
    try {
      const queue = await comfyui.getQueue();
      const text = JSON.stringify(
        { queue_running: queue.queue_running, queue_pending: queue.queue_pending },
        null,
        2
      );
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `list_queue failed: ${msg}` }] };
    }
  }
);

function isPromptInQueue(queue: { queue_running: unknown[]; queue_pending: unknown[] }, promptId: string): boolean {
  const match = (item: unknown) =>
    (Array.isArray(item) && item[1] === promptId) ||
    (item && typeof item === 'object' && (item as { prompt_id?: string }).prompt_id === promptId);
  return (
    queue.queue_running.some(match) ||
    queue.queue_pending.some(match)
  );
}

server.registerTool(
  'interrupt_execution',
  {
    description:
      'Stop the currently running workflow on ComfyUI. Optionally pass prompt_id to interrupt only that prompt. If cleanup_after_ms is set (and prompt_id given), after interrupt the tool will poll the queue and remove the prompt from queue if it is still there (frees GPU for next job). Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().optional().describe('Optional: interrupt only this prompt if it is running; omit to interrupt current run'),
      cleanup_after_ms: z.number().int().min(0).optional().describe('If set (and prompt_id given), after interrupt poll queue and remove prompt if still running (e.g. 5000). Helps free GPU after FLUX/interrupt.'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use interrupt_execution.',
          },
        ],
      };
    }
    try {
      await comfyui.interruptExecution(args.prompt_id);
      const lines: string[] = [
        args.prompt_id ? `Interrupt sent for prompt_id: ${args.prompt_id}.` : 'Interrupt sent. Current execution will stop.',
      ];
      if (args.prompt_id && args.cleanup_after_ms != null && args.cleanup_after_ms > 0) {
        const waitMs = Math.min(args.cleanup_after_ms, 8000);
        await new Promise((r) => setTimeout(r, Math.min(1500, waitMs)));
        try {
          const queue = await comfyui.getQueue();
          if (isPromptInQueue(queue, args.prompt_id)) {
            await comfyui.deleteQueueItems([args.prompt_id]);
            lines.push('Prompt was still in queue; removed so next job can run.');
          }
        } catch {
          lines.push('Could not check/clear queue; use delete_queue_items or clear_queue if the next job stays stuck.');
        }
      }
      return { content: [{ type: 'text', text: lines.join(' ') }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `interrupt_execution failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'clear_queue',
  {
    description: 'Remove all pending ComfyUI queue items. Does not send an interrupt; use interrupt_execution to stop the running workflow. Requires COMFYUI_HOST.',
    inputSchema: {},
  },
  async () => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use clear_queue.',
          },
        ],
      };
    }
    try {
      await comfyui.clearQueue();
      return { content: [{ type: 'text', text: 'Queue cleared.' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `clear_queue failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'delete_queue_items',
  {
    description:
      'Remove specific items from ComfyUI queue by prompt_id. Use list_queue to get prompt_ids. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_ids: z
        .array(z.string())
        .describe('List of prompt_id to remove from queue (from list_queue or execute_workflow)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use delete_queue_items.',
          },
        ],
      };
    }
    if (!args.prompt_ids?.length) {
      return { content: [{ type: 'text', text: 'Provide at least one prompt_id.' }] };
    }
    try {
      await comfyui.deleteQueueItems(args.prompt_ids);
      return { content: [{ type: 'text', text: `Removed from queue: ${args.prompt_ids.join(', ')}` }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `delete_queue_items failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'install_custom_node',
  {
    description:
      'Install one or more custom nodes via ComfyUI-Manager cm-cli (e.g. ComfyUI-Blip, WAS-Node-Suite). Requires COMFYUI_PATH and ComfyUI-Manager installed in custom_nodes. ComfyUI-Manager cm-cli requires Python package "rich" (pip install rich in your ComfyUI Python environment). Restart ComfyUI after install to load new nodes.',
    inputSchema: {
      node_names: z
        .array(z.string().min(1)).min(1)
        .describe('Node pack names as in ComfyUI-Manager (e.g. ComfyUI-Blip, ComfyUI-Impact-Pack)'),
      channel: z.string().optional().describe('Optional channel (see cm-cli docs)'),
      mode: z.enum(['remote', 'local', 'cache']).optional().describe('Optional mode'),
    },
  },
  async (args) => {
    if (!managerCli.getComfyPath()) {
      return {
        content: [
          {
            type: 'text',
            text: 'COMFYUI_PATH is not set. Set it to your ComfyUI installation directory to install custom nodes.',
          },
        ],
      };
    }
    const cliArgs = ['install', ...args.node_names];
    if (args.channel) cliArgs.push('--channel', args.channel);
    if (args.mode) cliArgs.push('--mode', args.mode);
    const result = managerCli.runCmCli(cliArgs);
    const text = [
      result.ok ? 'Install completed.' : 'Install failed.',
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
      result.code != null ? `exit code: ${result.code}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'install_model',
  {
    description:
      'Download and install a model (checkpoint, LoRA, VAE, etc.) by URL. Requires COMFYUI_PATH. Uses comfy-cli if available (pip install comfy-cli), otherwise fetches the file directly. model_type: checkpoint, lora, vae, controlnet, clip, embeddings, hypernetwork, upscale_models, clip_vision, unet, diffusers.',
    inputSchema: {
      url: z.string().url().describe('Direct download URL (e.g. from Civitai, HuggingFace)'),
      model_type: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/i, 'Model type must be a category without path separators')
        .default('checkpoint')
        .describe('Type: checkpoint, lora, vae, controlnet, clip, embeddings, hypernetwork, upscale_models, clip_vision, unet, diffusers'),
    },
  },
  async (args) => {
    if (!managerCli.getComfyPath()) {
      return {
        content: [
          {
            type: 'text',
            text: 'COMFYUI_PATH is not set. Set it to your ComfyUI installation directory to install models.',
          },
        ],
      };
    }
    const relativePath = managerCli.getRelativePathForModelType(args.model_type);
    if (managerCli.isComfyCliAvailable()) {
      const result = managerCli.runComfyModelDownload(args.url, relativePath);
      const text = [
        result.ok ? 'Model download completed (comfy-cli).' : 'Model download failed (comfy-cli).',
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
        result.code != null ? `exit code: ${result.code}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    }
    const download = await managerCli.downloadModelToDir(args.url, relativePath);
    if (download.ok) {
      return { content: [{ type: 'text', text: `Model saved to ${download.path}. Restart ComfyUI if needed to see it.` }] };
    }
    return { content: [{ type: 'text', text: `install_model failed: ${download.error}` }] };
  }
);

server.registerTool(
  'save_workflow',
  {
    description:
      'Save a workflow JSON to file (workflows/<name>.json). Returns path. Use after build_workflow to persist for later load_workflow or execute_workflow.',
    inputSchema: {
      name: z.string().describe('Name for the workflow file (alphanumeric, dash, underscore; .json added automatically)'),
      workflow: z.string().describe('Workflow JSON string (from build_workflow or load_workflow)'),
    },
  },
  async (args) => {
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    try {
      const path = await saveWorkflow(args.name, parsed);
      return { content: [{ type: 'text', text: `Saved to ${path}` }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `save_workflow failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'list_saved_workflows',
  {
    description: 'List saved workflows (names and paths) from workflows/ directory.',
    inputSchema: {},
  },
  async () => {
    try {
      const list = await listSavedWorkflows();
      if (list.length === 0) {
        return { content: [{ type: 'text', text: 'No saved workflows. Use save_workflow to save one.' }] };
      }
      const text = list.map((e) => `${e.name}: ${e.path}`).join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `list_saved_workflows failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'load_workflow',
  {
    description:
      'Load a saved workflow by name (from workflows/<name>.json) or by path. Returns workflow JSON for use with execute_workflow or save_workflow.',
    inputSchema: {
      name_or_path: z.string().describe('Workflow name (filename without .json) or full path to .json file'),
    },
  },
  async (args) => {
    try {
      const workflow = await loadWorkflow(args.name_or_path);
      const text = JSON.stringify(workflow, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `load_workflow failed: ${msg}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-comfy-ui-builder MCP server running on stdio');

  // Background sync from ComfyUI on startup (non-blocking)
  const hybrid = getHybridDiscovery();
  if (hybrid) {
    hybrid.syncToKnowledgeBase().then((result) => {
      if (result.added.length > 0) {
        console.error(`[sync] Added ${result.added.length} nodes from ComfyUI to knowledge base`);
        invalidateBaseNodesCache();
      }
    }).catch(() => {
      // ComfyUI not available — silent, expected when COMFYUI_HOST not set or ComfyUI not running
    });
  }
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
