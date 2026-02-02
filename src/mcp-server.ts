/**
 * MCP server: list_node_types, get_node_info, check_compatibility, suggest_nodes;
 * discover_nodes_live, search_nodes, get_node_inputs, get_node_outputs, list_node_categories, sync_nodes_to_knowledge (Node Discovery);
 * list_templates, build_workflow, save_workflow, list_saved_workflows, load_workflow;
 * create_workflow, add_node, connect_nodes, remove_node, set_node_input, get_workflow_json, validate_workflow, finalize_workflow (dynamic workflow);
 * execute_workflow, get_execution_status, list_queue, interrupt_execution, clear_queue, delete_queue_items (require COMFYUI_HOST for execution/queue tools);
 * list_models, get_model_info, check_model_exists, get_workflow_models, check_workflow_models (Model Management);
 * create_template, apply_template, validate_template_params, list_macros, insert_macro, execute_chain (Workflow Composition).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseNodesJson, NodeCompatibilityData, NodeDescription } from './types/node-types.js';
import { buildFromTemplate, listTemplates } from './workflow/workflow-builder.js';
import { saveWorkflow, listSavedWorkflows, loadWorkflow } from './workflow/workflow-storage.js';
import {
  addNode,
  connectNodes,
  removeNode,
  setNodeInput,
  getWorkflow as getWorkflowFromContext,
  validateWorkflow as validateWorkflowContext,
} from './workflow/dynamic-builder.js';
import { getWorkflowStore } from './workflow/workflow-store.js';
import { setHybridDiscoveryOptions, getHybridDiscovery } from './node-discovery/hybrid-discovery.js';
import * as comfyui from './comfyui-client.js';
import * as managerCli from './manager-cli.js';
import { executeBatch } from './workflow/batch-executor.js';
import { listOutputs, downloadOutput, downloadAllOutputs } from './output-manager.js';
import { ModelManager } from './model-manager.js';
import {
  createTemplate,
  applyTemplate,
  validateTemplateParams,
  type WorkflowTemplate,
  type ParameterDefinition,
} from './workflow/workflow-template.js';
import { listMacros, getMacro, insertMacro as insertMacroIntoContext, registerPluginMacros } from './workflow/macro.js';
import { executeChain } from './workflow/chainer.js';
import type { ComfyUIWorkflow } from './types/comfyui-api-types.js';
import { loadPlugins, summarizePlugins, type LoadedPlugin } from './plugins/plugin-loader.js';

const KNOWLEDGE_DIR = process.env.COMFYUI_KNOWLEDGE_DIR?.trim() || join(process.cwd(), 'knowledge');
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

/**
 * Validate workflow node references before execution.
 * Checks that all [nodeId, outputIndex] references point to existing nodes.
 */
function validateWorkflow(workflow: ComfyUIWorkflow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(Object.keys(workflow));

  for (const [nodeId, nodeDef] of Object.entries(workflow)) {
    const inputs = nodeDef.inputs ?? {};
    for (const [inputName, inputValue] of Object.entries(inputs)) {
      if (Array.isArray(inputValue) && inputValue.length === 2) {
        const [refNodeId, outputIndex] = inputValue;
        if (typeof refNodeId === 'string' && typeof outputIndex === 'number') {
          if (!nodeIds.has(refNodeId)) {
            errors.push(`Node "${nodeId}" input "${inputName}" references non-existent node "${refNodeId}"`);
          }
          if (outputIndex < 0) {
            errors.push(`Node "${nodeId}" input "${inputName}" has invalid output index ${outputIndex}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Plugins (templates/macros from plugins/*/plugin.json)
let loadedPlugins: LoadedPlugin[] = [];

function initPlugins(): void {
  loadedPlugins = loadPlugins();
  const allPluginMacros = loadedPlugins.flatMap((p) => p.macros);
  registerPluginMacros(allPluginMacros);
}

const server = new McpServer(
  { name: 'mcp-comfy-ui-builder', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// Load plugins at startup (safe no-op if plugins/ is absent)
initPlugins();

server.registerTool(
  'list_node_types',
  {
    description: 'List ComfyUI node types from the knowledge base. Optionally filter by category or priority.',
    inputSchema: {
      category: z.string().optional().describe('Filter by category (e.g. loaders, sampling, image)'),
      priority: z.enum(['high', 'medium', 'low']).optional().describe('Filter by priority'),
    },
  },
  (args) => {
    const base = loadBaseNodes();
    let entries = Object.entries(base.nodes ?? {});
    if (args.category) {
      const c = args.category.toLowerCase();
      entries = entries.filter(([, n]) => (n as NodeDescription).category?.toLowerCase() === c);
    }
    if (args.priority) {
      entries = entries.filter(([, n]) => (n as NodeDescription).priority === args.priority);
    }
    const list = entries.map(([className, n]) => {
      const d = n as NodeDescription;
      return `${className}: ${d.display_name} (${d.category}, ${d.priority})`;
    });
    return { content: [{ type: 'text', text: list.length ? list.join('\n') : 'No nodes match the filter.' }] };
  }
);

server.registerTool(
  'get_node_info',
  {
    description: 'Get full node information for a ComfyUI node by its class name.',
    inputSchema: {
      node_name: z.string().describe('Node class name (e.g. KSampler, CheckpointLoaderSimple)'),
    },
  },
  (args) => {
    const base = loadBaseNodes();
    const node = (base.nodes ?? {})[args.node_name];
    if (!node) {
      return { content: [{ type: 'text', text: `Node "${args.node_name}" not found in knowledge base.` }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
  }
);

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

server.registerTool(
  'suggest_nodes',
  {
    description:
      'Suggest ComfyUI nodes for a task (search by description/use_cases) or by output type they produce.',
    inputSchema: {
      task_description: z.string().optional().describe('Short task description (e.g. "load checkpoint", "decode latent")'),
      input_type: z.string().optional().describe('Output type to match (e.g. MODEL, IMAGE, LATENT)'),
    },
  },
  (args) => {
    const base = loadBaseNodes();
    const nodes = Object.entries(base.nodes ?? {}) as [string, NodeDescription][];
    let filtered = nodes;
    if (args.task_description) {
      const q = args.task_description.toLowerCase();
      filtered = nodes.filter(([, n]) => {
        const desc = (n.description ?? '').toLowerCase();
        const useCases = (n.use_cases ?? []).join(' ').toLowerCase();
        return desc.includes(q) || useCases.includes(q) || (n.display_name ?? '').toLowerCase().includes(q);
      });
    }
    if (args.input_type) {
      const t = args.input_type.toUpperCase();
      filtered = filtered.filter(([, n]) => (n.return_types ?? []).includes(t));
    }
    const list = filtered.slice(0, 20).map(([className, n]) => `${className}: ${n.display_name} — ${n.description?.slice(0, 80)}`);
    return {
      content: [{ type: 'text', text: list.length ? list.join('\n') : 'No matching nodes.' }],
    };
  }
);

// --- Node Discovery (Phase 3): live ComfyUI + knowledge base ---
server.registerTool(
  'discover_nodes_live',
  {
    description:
      'Get all node definitions from the running ComfyUI instance (GET /object_info). Returns class names and categories. Requires ComfyUI to be running at COMFYUI_HOST.',
    inputSchema: {},
  },
  async () => {
    try {
      const objectInfo = await comfyui.getObjectInfo();
      const entries = Object.entries(objectInfo).map(([name, node]) => `${name}: ${node.category ?? 'unknown'}`);
      const text =
        entries.length > 0
          ? `Total nodes: ${entries.length}\n` + entries.slice(0, 200).join('\n') + (entries.length > 200 ? `\n... and ${entries.length - 200} more` : '')
          : 'No nodes returned from ComfyUI.';
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `discover_nodes_live failed (is ComfyUI running?): ${msg}` }] };
    }
  }
);

server.registerTool(
  'search_nodes',
  {
    description:
      'Search nodes by query string and optional filters (category, input_type, output_type). Searches both live ComfyUI and knowledge base; live overrides KB for same class.',
    inputSchema: {
      query: z.string().optional().describe('Search in class name, display name, description, category'),
      category: z.string().optional().describe('Filter by category (e.g. loaders, sampling)'),
      input_type: z.string().optional().describe('Filter by input type (e.g. MODEL, IMAGE)'),
      output_type: z.string().optional().describe('Filter by output type (e.g. LATENT, IMAGE)'),
    },
  },
  async (args) => {
    const hybrid = getHybridDiscovery();
    if (!hybrid) {
      return { content: [{ type: 'text', text: 'Node discovery not initialized.' }] };
    }
    try {
      const list = await hybrid.searchNodes(args.query ?? '', {
        category: args.category,
        input_type: args.input_type,
        output_type: args.output_type,
      });
      const text = list
        .slice(0, 100)
        .map((n) => `${n.class_name}: ${n.display_name} (${n.category}) [${n.source}]`)
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text: list.length ? `Found ${list.length} node(s):\n${text}` + (list.length > 100 ? `\n... and ${list.length - 100} more` : '') : 'No nodes match.',
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `search_nodes failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_node_inputs',
  {
    description: 'Get detailed input definitions for a node (required and optional). Uses live ComfyUI if available, otherwise knowledge base.',
    inputSchema: {
      node_name: z.string().describe('Node class name (e.g. KSampler, CheckpointLoaderSimple)'),
    },
  },
  async (args) => {
    const hybrid = getHybridDiscovery();
    if (!hybrid) {
      return { content: [{ type: 'text', text: 'Node discovery not initialized.' }] };
    }
    const node = await hybrid.getNode(args.node_name);
    if (!node) {
      return { content: [{ type: 'text', text: `Node "${args.node_name}" not found in live ComfyUI or knowledge base.` }] };
    }
    const payload = { required: node.input.required ?? {}, optional: node.input.optional ?? {}, source: node.source };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  'get_node_outputs',
  {
    description: 'Get output types and names for a node. Uses live ComfyUI if available, otherwise knowledge base.',
    inputSchema: {
      node_name: z.string().describe('Node class name (e.g. KSampler, CheckpointLoaderSimple)'),
    },
  },
  async (args) => {
    const hybrid = getHybridDiscovery();
    if (!hybrid) {
      return { content: [{ type: 'text', text: 'Node discovery not initialized.' }] };
    }
    const node = await hybrid.getNode(args.node_name);
    if (!node) {
      return { content: [{ type: 'text', text: `Node "${args.node_name}" not found in live ComfyUI or knowledge base.` }] };
    }
    const payload = { output: node.output, output_name: node.output_name, source: node.source };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  }
);

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
    description: 'List available workflow template ids (e.g. txt2img). No ComfyUI connection needed.',
    inputSchema: {},
  },
  () => {
    const list = listTemplates();
    return { content: [{ type: 'text', text: list.length ? list.join(', ') : 'No templates.' }] };
  }
);

server.registerTool(
  'build_workflow',
  {
    description:
      'Build a ComfyUI workflow from a template and parameters. Returns workflow JSON ready to execute or save. No ComfyUI connection needed.',
    inputSchema: {
      template: z.string().describe('Template id (e.g. txt2img). Use list_templates to see available.'),
      params: z.record(z.string(), z.unknown()).optional().describe('Optional: width, height, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, batch_size, denoise'),
    },
  },
  (args) => {
    try {
      const workflow = buildFromTemplate(args.template, args.params ?? {});
      const text = JSON.stringify(workflow, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `build_workflow failed: ${msg}` }] };
    }
  }
);

// --- Dynamic workflow tools (Phase 2) ---
const workflowStore = getWorkflowStore();

server.registerTool(
  'create_workflow',
  {
    description:
      'Create a new empty workflow context. Returns workflow_id to use with add_node, connect_nodes, get_workflow_json, validate_workflow, finalize_workflow, execute_workflow.',
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
      inputs: z.record(z.string(), z.unknown()).optional().describe('Node inputs (literal values; use connect_nodes for links)'),
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
  'connect_nodes',
  {
    description: 'Connect an output of one node to an input of another in a dynamic workflow.',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
      from_node: z.string().describe('Source node id (e.g. "1")'),
      output_idx: z.number().int().min(0).describe('Output index (usually 0)'),
      to_node: z.string().describe('Target node id'),
      input_name: z.string().describe('Target input name (e.g. model, clip, positive)'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    try {
      connectNodes(ctx, args.from_node, args.output_idx, args.to_node, args.input_name);
      return { content: [{ type: 'text', text: 'ok' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `connect_nodes failed: ${msg}` }] };
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
  'set_node_input',
  {
    description: 'Set a literal input on a node in a dynamic workflow (overwrites existing value or link).',
    inputSchema: {
      workflow_id: z.string().describe('Workflow id from create_workflow'),
      node_id: z.string().describe('Node id'),
      input_name: z.string().describe('Input name (e.g. text, ckpt_name, seed)'),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown())]).describe('Value (string, number, boolean, or [nodeId, outputIndex] for links)'),
    },
  },
  (args) => {
    const ctx = workflowStore.get(args.workflow_id);
    if (!ctx) {
      return { content: [{ type: 'text', text: `Workflow "${args.workflow_id}" not found or expired.` }] };
    }
    try {
      setNodeInput(ctx, args.node_id, args.input_name, args.value);
      return { content: [{ type: 'text', text: 'ok' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `set_node_input failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_workflow_json',
  {
    description: 'Get the current workflow JSON for a dynamic workflow (for execute_workflow or save_workflow).',
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
  'finalize_workflow',
  {
    description: 'Get the workflow JSON for a dynamic workflow (same as get_workflow_json). Use with execute_workflow or save_workflow.',
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
  'execute_workflow',
  {
    description:
      'Submit a ComfyUI workflow to run. Returns prompt_id. Use get_execution_status(prompt_id) to check result. Requires COMFYUI_HOST and ComfyUI running.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string (from build_workflow or loaded file)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST (e.g. http://127.0.0.1:8188) and ensure ComfyUI is running. Then retry execute_workflow.',
          },
        ],
      };
    }
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    const validation = validateWorkflow(parsed);
    if (!validation.valid) {
      return { content: [{ type: 'text', text: `Workflow validation failed:\n${validation.errors.join('\n')}` }] };
    }
    try {
      const { prompt_id } = await comfyui.submitPrompt(parsed);
      return {
        content: [
          {
            type: 'text',
            text: `Workflow queued. prompt_id: ${prompt_id}. Use get_execution_status with this prompt_id to check result.`,
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `execute_workflow failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'execute_workflow_sync',
  {
    description:
      'Submit a ComfyUI workflow and wait until execution completes with real-time progress (WebSocket if available, polling fallback). Returns prompt_id, status (completed/failed/timeout), and outputs. Use when you need the result before continuing. Requires COMFYUI_HOST.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string (from build_workflow or loaded file)'),
      timeout_ms: z.number().int().min(1000).optional().describe('Max wait in milliseconds (default 300000)'),
      stream_progress: z.boolean().optional().describe('Stream progress updates via WebSocket (default true)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use execute_workflow_sync.',
          },
        ],
      };
    }
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    const validation = validateWorkflow(parsed);
    if (!validation.valid) {
      return { content: [{ type: 'text', text: `Workflow validation failed:\n${validation.errors.join('\n')}` }] };
    }
    try {
      const streamProgress = args.stream_progress ?? true;
      const progressUpdates: string[] = [];

      const result = await comfyui.submitPromptAndWaitWithProgress(
        parsed,
        args.timeout_ms,
        streamProgress
          ? (progress) => {
              const status = `[${progress.status}] ${progress.current_node ?? 'waiting'}`;
              const progressPct = progress.current_node_progress
                ? ` (${Math.round(progress.current_node_progress * 100)}%)`
                : '';
              progressUpdates.push(status + progressPct);
            }
          : undefined
      );

      const isWebSocket = await comfyui.isWebSocketAvailable();
      const output = {
        ...result,
        progress_method: isWebSocket ? 'websocket' : 'polling',
        ...(progressUpdates.length > 0 && { progress_log: progressUpdates }),
      };

      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `execute_workflow_sync failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_execution_status',
  {
    description:
      'Get execution status and outputs for a prompt. Returns status, image filenames, and view URLs. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id returned by execute_workflow'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [
          {
            type: 'text',
            text: 'ComfyUI is not configured. Set COMFYUI_HOST to use get_execution_status.',
          },
        ],
      };
    }
    try {
      const entries = await comfyui.getHistory(args.prompt_id);
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: `No history found for prompt_id: ${args.prompt_id}. It may still be running or not yet recorded.` }] };
      }
      const entry = entries[0];
      const outputs = entry.outputs ?? {};
      const lines: string[] = [`prompt_id: ${args.prompt_id}`];
      const statusStr = (entry.status as { status_str?: string })?.status_str;
      if (statusStr) lines.push(`status: ${statusStr}`);
      for (const [nodeId, out] of Object.entries(outputs)) {
        const nodeOut = out as { images?: Array<{ filename: string; subfolder?: string }>; text?: string[]; string?: string[] };
        const images = nodeOut.images;
        if (images?.length) {
          lines.push(`node ${nodeId} images: ${images.map((i) => i.filename).join(', ')}`);
          const base = process.env.COMFYUI_HOST?.replace(/\/$/, '') ?? 'http://127.0.0.1:8188';
          for (const img of images) {
            const sub = img.subfolder ? `&subfolder=${encodeURIComponent(img.subfolder)}` : '';
            lines.push(`  view: ${base}/view?filename=${encodeURIComponent(img.filename)}&type=output${sub}`);
          }
        }
        const textOutput = nodeOut.text ?? nodeOut.string;
        if (Array.isArray(textOutput) && textOutput.length) {
          lines.push(`node ${nodeId} text: ${textOutput.join(' | ')}`);
        } else if (typeof textOutput === 'string') {
          lines.push(`node ${nodeId} text: ${textOutput}`);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `get_execution_status failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_execution_progress',
  {
    description:
      'Get real-time execution progress for a prompt (WebSocket if available, polling fallback). Returns status, current_node, progress%, queue_position, and outputs. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id returned by execute_workflow or execute_workflow_sync'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use get_execution_progress.' }],
      };
    }
    try {
      // Try WebSocket first for real-time progress
      if (await comfyui.isWebSocketAvailable()) {
        const { getWSClient } = await import('./comfyui-ws-client.js');
        const wsClient = getWSClient();
        const progress = wsClient.getProgress(args.prompt_id);

        if (progress) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...progress,
                    method: 'websocket',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      // Fallback to polling (existing implementation)
      const entries = await comfyui.getHistory(args.prompt_id);
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: `No history for prompt_id: ${args.prompt_id}. Still running or not recorded.` }] };
      }
      const entry = entries[0];
      const outputs = entry.outputs ?? {};
      const lines: string[] = [`prompt_id: ${args.prompt_id}`, 'method: polling'];
      const statusStr = (entry.status as { status_str?: string })?.status_str;
      if (statusStr) lines.push(`status: ${statusStr}`);
      for (const [nodeId, out] of Object.entries(outputs)) {
        const nodeOut = out as { images?: Array<{ filename: string; subfolder?: string }> };
        if (nodeOut.images?.length) {
          lines.push(`node ${nodeId} images: ${nodeOut.images.map((i) => i.filename).join(', ')}`);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `get_execution_progress failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'execute_workflow_stream',
  {
    description:
      'Execute workflow with streaming real-time progress updates. Requires WebSocket support. Returns result and progress event history. Use for monitoring execution progress. Requires COMFYUI_HOST and WebSocket connection.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string (from build_workflow or loaded file)'),
      timeout_ms: z.number().int().min(1000).optional().describe('Max wait in milliseconds (default 300000)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return {
        content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST.' }],
      };
    }

    // Check WebSocket availability
    if (!(await comfyui.isWebSocketAvailable())) {
      try {
        const { getWSClient } = await import('./comfyui-ws-client.js');
        const wsClient = getWSClient();
        await wsClient.connect();
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: 'WebSocket not available. Use execute_workflow_sync for polling-based execution.',
            },
          ],
        };
      }
    }

    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }

    const validation = validateWorkflow(parsed);
    if (!validation.valid) {
      return { content: [{ type: 'text', text: `Workflow validation failed:\n${validation.errors.join('\n')}` }] };
    }

    try {
      type ExecutionProgress = import('./types/comfyui-api-types.js').ExecutionProgress;
      const events: ExecutionProgress[] = [];

      const result = await comfyui.submitPromptAndWaitWithProgress(parsed, args.timeout_ms, (progress) => {
        events.push({ ...progress });
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                result,
                event_count: events.length,
                events: events.slice(-10), // Last 10 events
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `execute_workflow_stream failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'execute_batch',
  {
    description:
      'Execute multiple workflows in batch. Submits each workflow and waits for completion (polling). Optional concurrency and stop_on_error. Requires COMFYUI_HOST.',
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
  'list_outputs',
  {
    description: 'List all output files (images, gifs) for a completed prompt. Returns prompt_id, node_id, type, filename, url. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id from execute_workflow or execute_workflow_sync'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use list_outputs.' }] };
    }
    try {
      const files = await listOutputs(args.prompt_id);
      const text = files.length ? JSON.stringify(files, null, 2) : `No outputs for prompt_id: ${args.prompt_id}.`;
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `list_outputs failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'download_output',
  {
    description: 'Download a single output file to a local path. Use list_outputs to get file info. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id'),
      node_id: z.string().describe('Node id (from list_outputs)'),
      filename: z.string().describe('Filename (from list_outputs)'),
      dest_path: z.string().describe('Local path to save the file'),
      subfolder: z.string().optional().describe('Subfolder (from list_outputs)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use download_output.' }] };
    }
    try {
      const files = await listOutputs(args.prompt_id);
      const file = files.find(
        (f) => f.node_id === args.node_id && f.filename === args.filename && (args.subfolder == null || f.subfolder === args.subfolder)
      );
      if (!file) {
        return { content: [{ type: 'text', text: `No matching output for prompt_id=${args.prompt_id}, node_id=${args.node_id}, filename=${args.filename}` }] };
      }
      const path = await downloadOutput(file, args.dest_path);
      return { content: [{ type: 'text', text: `Saved: ${path}` }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `download_output failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'download_all_outputs',
  {
    description: 'Download all output files for a prompt into a directory. Returns list of saved paths. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().describe('Prompt id from execute_workflow or execute_workflow_sync'),
      dest_dir: z.string().describe('Local directory path to save files'),
      prefix_node_id: z.boolean().optional().describe('Prefix filename with node_id to avoid collisions (default true)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use download_all_outputs.' }] };
    }
    try {
      const paths = await downloadAllOutputs(args.prompt_id, args.dest_dir, {
        prefixNodeId: args.prefix_node_id ?? true,
      });
      const text = paths.length ? paths.join('\n') : `No outputs for prompt_id: ${args.prompt_id}.`;
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `download_all_outputs failed: ${msg}` }] };
    }
  }
);

// --- Model Management (Phase 5) ---
const MODEL_TYPE_ENUM = z.enum([
  'checkpoint',
  'lora',
  'vae',
  'controlnet',
  'upscale',
  'embedding',
  'clip',
]);

server.registerTool(
  'list_models',
  {
    description:
      'List models available on the ComfyUI server (from object_info). Optionally filter by type: checkpoint, lora, vae, controlnet, upscale, embedding, clip. Requires COMFYUI_HOST.',
    inputSchema: {
      type: MODEL_TYPE_ENUM.optional().describe('Filter by model type (omit for all types)'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use list_models.' }] };
    }
    try {
      const list = await modelManager.listModels(args.type);
      const text = list.length
        ? list.map((m) => `${m.type}: ${m.name}`).join('\n')
        : args.type
          ? `No ${args.type} models found on server.`
          : 'No models found (ComfyUI may not expose model lists in object_info).';
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `list_models failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_model_info',
  {
    description:
      'Get info for a model by name and type. Returns name, type, path; null if not found. Requires COMFYUI_HOST.',
    inputSchema: {
      name: z.string().describe('Model filename (e.g. sd_xl_base_1.0.safetensors)'),
      type: MODEL_TYPE_ENUM.describe('Model type: checkpoint, lora, vae, controlnet, upscale, embedding, clip'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use get_model_info.' }] };
    }
    try {
      const info = await modelManager.getModelInfo(args.name, args.type);
      const text = info ? JSON.stringify(info, null, 2) : `Model "${args.name}" (${args.type}) not found on server.`;
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `get_model_info failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'check_model_exists',
  {
    description: 'Check if a model exists on the ComfyUI server (in object_info model lists). Requires COMFYUI_HOST.',
    inputSchema: {
      name: z.string().describe('Model filename'),
      type: MODEL_TYPE_ENUM.describe('Model type'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use check_model_exists.' }] };
    }
    try {
      const exists = await modelManager.checkModelExists(args.name, args.type);
      return { content: [{ type: 'text', text: exists ? 'yes' : 'no' }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `check_model_exists failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'get_workflow_models',
  {
    description:
      'Extract required models from a workflow (loader nodes: CheckpointLoaderSimple, LoraLoader, VAELoader, ControlNetLoader, UpscaleModelLoader, etc.). Returns list of { name, type, nodeId, nodeClass, inputName }. No ComfyUI connection needed.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string'),
    },
  },
  (args) => {
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    const required = modelManager.getWorkflowModels(parsed);
    const text = required.length ? JSON.stringify(required, null, 2) : 'No model inputs found in workflow.';
    return { content: [{ type: 'text', text }] };
  }
);

server.registerTool(
  'check_workflow_models',
  {
    description:
      'Check which models required by a workflow exist on the ComfyUI server. Returns ready (boolean), missing, and found lists. Requires COMFYUI_HOST.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON string'),
    },
  },
  async (args) => {
    if (!comfyui.isComfyUIConfigured()) {
      return { content: [{ type: 'text', text: 'ComfyUI is not configured. Set COMFYUI_HOST to use check_workflow_models.' }] };
    }
    let parsed: ComfyUIWorkflow;
    try {
      parsed = JSON.parse(args.workflow) as ComfyUIWorkflow;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid workflow JSON.' }] };
    }
    try {
      const result = await modelManager.checkWorkflowModels(parsed);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `check_workflow_models failed: ${msg}` }] };
    }
  }
);

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
      'Create a parameterized workflow template from a workflow and parameter definitions. Returns template JSON for use with apply_template or validate_template_params. Parameters bind to node inputs via nodeBindings (nodeId, inputName).',
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
  'apply_template',
  {
    description:
      'Apply parameter values to a workflow template. Returns workflow JSON ready to execute or save. Use create_template to build a template, then apply_template with values.',
    inputSchema: {
      template: z.string().describe('Template JSON string (from create_template)'),
      values: z.record(z.string(), z.unknown()).describe('Parameter values (e.g. { prompt: "a cat", seed: 42 })'),
    },
  },
  (args) => {
    let template: WorkflowTemplate;
    try {
      template = JSON.parse(args.template) as WorkflowTemplate;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid template JSON.' }] };
    }
    try {
      const workflow = applyTemplate(template, args.values ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `apply_template failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'validate_template_params',
  {
    description: 'Validate that parameter values satisfy a workflow template (required params, types).',
    inputSchema: {
      template: z.string().describe('Template JSON string'),
      values: z.record(z.string(), z.unknown()).describe('Parameter values'),
    },
  },
  (args) => {
    let template: WorkflowTemplate;
    try {
      template = JSON.parse(args.template) as WorkflowTemplate;
    } catch {
      return { content: [{ type: 'text', text: 'Invalid template JSON.' }] };
    }
    const result = validateTemplateParams(template, args.values ?? {});
    const text = result.valid ? 'valid' : `invalid:\n${result.errors.join('\n')}`;
    return { content: [{ type: 'text', text }] };
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
                outputIndex: z.number().int().min(0),
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
  'prepare_image_for_workflow',
  {
    description:
      'Fetch the first output image from a completed prompt and upload it to ComfyUI input folder. Returns the filename to use in LoadImage for a follow-up workflow (e.g. image caption / verification). Use after get_execution_status confirms the prompt finished with image output. Requires COMFYUI_HOST.',
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

server.registerTool(
  'interrupt_execution',
  {
    description:
      'Stop the currently running workflow on ComfyUI. Optionally pass prompt_id to interrupt only that prompt. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().optional().describe('Optional: interrupt only this prompt if it is running; omit to interrupt current run'),
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
      const msg = args.prompt_id
        ? `Interrupt sent for prompt_id: ${args.prompt_id}.`
        : 'Interrupt sent. Current execution will stop.';
      return { content: [{ type: 'text', text: msg }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `interrupt_execution failed: ${msg}` }] };
    }
  }
);

server.registerTool(
  'clear_queue',
  {
    description: 'Clear ComfyUI queue: remove all pending and stop/clear running. Requires COMFYUI_HOST.',
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
        .array(z.string())
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
