import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as comfyui from '../comfyui-client.js';
import { getWSClient } from '../comfyui-ws-client.js';
import { analyzeSystemResources, getWorkflowResolution } from '../resource-analyzer.js';
import type { ComfyUIWorkflow, ExecutionProgress, HistoryEntry } from '../types/comfyui-api-types.js';

const reply = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  ...(isError && { isError: true }),
});

const workflowSchema = z.record(z.string(), z.object({
  class_type: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
}));

function parseWorkflow(json: string): ComfyUIWorkflow {
  const workflow = workflowSchema.parse(JSON.parse(json));
  for (const [nodeId, node] of Object.entries(workflow)) {
    for (const [input, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number') {
        if (!Object.hasOwn(workflow, value[0]) || !Number.isInteger(value[1]) || value[1] < 0) {
          throw new Error(`Invalid connection at node ${nodeId} input ${input}`);
        }
      }
    }
  }
  return workflow;
}

function historyErrors(entry: HistoryEntry): Record<string, unknown>[] {
  const errors: Record<string, unknown>[] = [];
  for (const message of entry.status?.messages ?? []) {
    // ComfyUI history encodes events as [event_name, payload].
    if (Array.isArray(message) && typeof message[0] === 'string') {
      if (message[0] !== 'execution_error' && message[0] !== 'execution_interrupted') continue;
      const payload = message[1];
      errors.push(payload && typeof payload === 'object' ? payload : { exception_message: String(payload) });
    } else if (message && typeof message === 'object') {
      errors.push(message as Record<string, unknown>);
    } else {
      errors.push({ exception_message: String(message) });
    }
  }
  return errors;
}

export function registerExecutionTools(server: McpServer): void {
  server.registerTool('execute_workflow', {
    description: 'Submit workflow JSON to ComfyUI. By default waits for a result with outputs; wait=false returns prompt_id immediately. include_events adds the last 10 progress events and total event count. auto combines WebSocket with polling; websocket subscribes then checks history once to recover fast runs, with no recurring polling; polling avoids WebSocket. Inspect submitted runs with get_execution. Requires COMFYUI_HOST.',
    inputSchema: {
      workflow: z.string().describe('Workflow JSON from build_workflow, get_workflow_json, or load_workflow'),
      wait: z.boolean().default(true).describe('Wait for completion; false only queues the workflow'),
      include_events: z.boolean().default(false).describe('Collect recent progress events; requires wait=true and a non-polling transport'),
      timeout_ms: z.number().int().min(1000).optional().describe('Completion timeout; defaults to resource recommendation or 300000ms'),
      progress_transport: z.enum(['auto', 'websocket', 'polling']).default('auto').describe('auto uses WebSocket plus polling; websocket requires a connection and checks history once after subscribing; polling uses history only'),
    },
  }, async (args) => {
    if (!args.wait && (args.include_events || args.timeout_ms !== undefined || args.progress_transport !== 'auto')) {
      return reply({ error: 'wait=false cannot use include_events, timeout_ms, or an explicit progress transport.' }, true);
    }
    if (args.include_events && args.progress_transport === 'polling') {
      return reply({ error: 'include_events requires auto or websocket progress transport.' }, true);
    }
    if (!comfyui.isComfyUIConfigured()) return reply({ error: 'Set COMFYUI_HOST to execute workflows.' }, true);
    let promptId: string | undefined;
    try {
      const workflow = parseWorkflow(args.workflow);
      let recommendation: ReturnType<typeof analyzeSystemResources> | undefined;
      if (args.wait) {
        try { recommendation = analyzeSystemResources(await comfyui.getSystemStats()); } catch { /* Resource stats may be unavailable while busy. */ }
        const dims = getWorkflowResolution(workflow);
        if (dims && recommendation && (dims.width > recommendation.max_width || dims.height > recommendation.max_height)) {
          return reply({ status: 'failed', error: `Requested resolution ${dims.width}×${dims.height} exceeds recommended ${recommendation.max_width}×${recommendation.max_height} for ${recommendation.gpu_name}. Use get_generation_recommendations or lower resolution.` }, true);
        }
        // Fail before submission if the caller explicitly requires WebSocket.
        if (args.progress_transport === 'websocket') await getWSClient().connect();
      }
      promptId = (await comfyui.submitPrompt(workflow)).prompt_id;
      if (!args.wait) return reply({ prompt_id: promptId, status: 'queued' });
      const events: ExecutionProgress[] = [];
      let eventCount = 0;
      const result = await comfyui.waitForCompletion(
        promptId,
        args.timeout_ms ?? recommendation?.recommended_timeout_ms ?? 300_000,
        args.include_events ? (event) => {
          eventCount++;
          events.push({ ...event });
          if (events.length > 10) events.shift();
        } : undefined,
        args.progress_transport,
      );
      return reply({
        ...result,
        ...(args.include_events && { event_count: eventCount, events }),
        ...(result.status === 'failed' && result.outputs && Object.keys(result.outputs).length > 0 && {
          outputs_present_hint: 'Partial outputs are available; use list_outputs and download_outputs.',
        }),
      });
    } catch (error) {
      return reply({ ...(promptId && { prompt_id: promptId }), status: 'failed', error: error instanceof Error ? error.message : String(error) }, true);
    }
  });

  server.registerTool('get_execution', {
    description: 'Inspect an existing prompt_id without submitting a run. summary returns recorded status, all node outputs, and image view URLs; progress prefers cached WebSocket state and otherwise checks history/queue; errors returns full recorded exception details and traceback. Requires COMFYUI_HOST.',
    inputSchema: {
      prompt_id: z.string().min(1).describe('Prompt id returned by execute_workflow'),
      view: z.enum(['summary', 'progress', 'errors']).default('summary').describe('Select recorded results, current progress, or full error details'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (args) => {
    if (!comfyui.isComfyUIConfigured()) return reply({ error: 'Set COMFYUI_HOST to inspect executions.' }, true);
    try {
      if (args.view === 'progress' && await comfyui.isWebSocketAvailable()) {
        const progress = getWSClient().getProgress(args.prompt_id);
        if (progress) return reply({ ...progress, method: 'websocket' });
      }
      const entry = (await comfyui.getHistory(args.prompt_id))[0];
      if (!entry) {
        if (args.view === 'progress') {
          const queue = await comfyui.getQueue();
          const matches = (item: unknown) => Array.isArray(item)
            ? item[1] === args.prompt_id
            : !!item && typeof item === 'object' && (item as { prompt_id?: string }).prompt_id === args.prompt_id;
          const position = queue.queue_pending.findIndex(matches);
          return reply({ prompt_id: args.prompt_id, status: queue.queue_running.some(matches) ? 'executing' : position >= 0 ? 'queued' : 'unknown', ...(position >= 0 && { queue_position: position }), method: 'polling' });
        }
        return reply({ prompt_id: args.prompt_id, status: 'unknown', message: 'No history yet; use view=progress to check the queue.' });
      }
      const errors = historyErrors(entry);
      if (args.view === 'errors') return reply({ prompt_id: args.prompt_id, status: entry.status?.status_str, errors });
      const images = Object.entries(entry.outputs ?? {}).flatMap(([nodeId, output]) => (output.images ?? []).map((image) => {
        const url = new URL('/view', `${process.env.COMFYUI_HOST?.replace(/\/$/, '')}/`);
        url.searchParams.set('filename', image.filename);
        url.searchParams.set('type', image.type ?? 'output');
        if (image.subfolder) url.searchParams.set('subfolder', image.subfolder);
        return { node_id: nodeId, ...image, view_url: url.toString() };
      }));
      return reply({ prompt_id: args.prompt_id, status: entry.status?.status_str ?? 'unknown', outputs: entry.outputs ?? {}, images, ...(errors.length > 0 && { errors }), ...(args.view === 'progress' && { method: 'polling' }) });
    } catch (error) {
      return reply({ prompt_id: args.prompt_id, error: error instanceof Error ? error.message : String(error) }, true);
    }
  });
}
