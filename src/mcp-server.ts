/**
 * MCP server: list_node_types, get_node_info, check_compatibility, suggest_nodes;
 * list_templates, build_workflow, save_workflow, list_saved_workflows, load_workflow;
 * execute_workflow, get_execution_status, list_queue, interrupt_execution, clear_queue, delete_queue_items (require COMFYUI_HOST for execution/queue tools).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseNodesJson, NodeCompatibilityData, NodeDescription } from './types/node-types.js';
import { buildFromTemplate, listTemplates } from './workflow/workflow-builder.js';
import { saveWorkflow, listSavedWorkflows, loadWorkflow } from './workflow/workflow-storage.js';
import * as comfyui from './comfyui-client.js';
import * as managerCli from './manager-cli.js';
import type { ComfyUIWorkflow } from './types/comfyui-api-types.js';

const KNOWLEDGE_DIR = join(process.cwd(), 'knowledge');
const BASE_NODES_PATH = join(KNOWLEDGE_DIR, 'base-nodes.json');
const COMPAT_PATH = join(KNOWLEDGE_DIR, 'node-compatibility.json');

// Cache for knowledge base with 5 minute TTL
const CACHE_TTL_MS = 5 * 60 * 1000;
let baseNodesCache: { data: BaseNodesJson; expires: number } | null = null;
let compatCache: { data: NodeCompatibilityData; expires: number } | null = null;

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

const server = new McpServer(
  { name: 'mcp-comfy-ui-builder', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

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
      'Install one or more custom nodes via ComfyUI-Manager cm-cli (e.g. ComfyUI-Blip, WAS-Node-Suite). Requires COMFYUI_PATH and ComfyUI-Manager installed in custom_nodes. Restart ComfyUI after install to load new nodes.',
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
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
