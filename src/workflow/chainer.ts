/**
 * Workflow chaining: run workflows in sequence, passing output image from one step to the next.
 * Uses WebSocket for real-time progress (with polling fallback).
 */
import * as comfyui from '../comfyui-client.js';
import { loadWorkflow } from './workflow-storage.js';
import type { ComfyUIWorkflow, ComfyUINodeDef } from '../types/comfyui-api-types.js';

export interface ChainStepInputFrom {
  step: number;
  outputNode: string;
  /** Zero-based image index in the selected output node's images array. */
  outputIndex: number;
}

export interface ChainStep {
  /** Workflow JSON object/string or saved workflow name (from workflows/<name>.json). */
  workflow: ComfyUIWorkflow | string;
  /** Override node inputs: { nodeId: { inputName: value } }. */
  params?: Record<string, Record<string, unknown>>;
  /** Take image from a previous step's output. Use with outputTo. */
  inputFrom?: ChainStepInputFrom;
  /** Input name in this workflow to set with the image filename (e.g. "image" for LoadImage). */
  outputTo?: string;
}

export interface ChainResult {
  stepIndex: number;
  prompt_id: string;
  status: 'completed' | 'failed';
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ChainConfig {
  timeoutMs?: number;
  stopOnError?: boolean;
}

function cloneWorkflow(w: ComfyUIWorkflow): ComfyUIWorkflow {
  const out: ComfyUIWorkflow = {};
  for (const [id, node] of Object.entries(w)) {
    const def = node as ComfyUINodeDef;
    out[id] = { class_type: def.class_type, inputs: { ...def.inputs } };
  }
  return out;
}

/** Find first node that has an input with the given name (e.g. LoadImage with "image"). */
function findNodeWithInput(workflow: ComfyUIWorkflow, inputName: string): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    const def = node as ComfyUINodeDef;
    if (inputName in (def.inputs ?? {})) return nodeId;
  }
  return null;
}

/**
 * Resolve step workflow: if string, load by name; clone and apply params.
 */
async function resolveStepWorkflow(
  step: ChainStep
): Promise<ComfyUIWorkflow> {
  let raw: ComfyUIWorkflow;
  if (typeof step.workflow === 'string') {
    raw = /^[\s]*[\[{]/.test(step.workflow)
      ? JSON.parse(step.workflow) as ComfyUIWorkflow
      : await loadWorkflow(step.workflow);
  } else {
    raw = step.workflow;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid workflow JSON: expected object');
  }
  const workflow = cloneWorkflow(raw);
  if (step.params) {
    for (const [nodeId, overrides] of Object.entries(step.params)) {
      const node = workflow[nodeId];
      if (node) {
        for (const [key, value] of Object.entries(overrides ?? {})) {
          node.inputs[key] = value;
        }
      }
    }
  }
  return workflow;
}

/**
 * Execute a chain of workflows. Each step runs after the previous completes.
 * If inputFrom is set, the output image from that step is uploaded and set as the next workflow's image input (outputTo).
 * Pre-connects WebSocket for optimized chain execution.
 */
export async function executeChain(
  steps: ChainStep[],
  config?: ChainConfig
): Promise<ChainResult[]> {
  const timeoutMs = config?.timeoutMs ?? 300_000;
  const stopOnError = config?.stopOnError ?? false;
  const results: ChainResult[] = [];

  // Pre-connect WebSocket for chain execution
  let useWebSocket = false;
  try {
    const { getWSClient } = await import('../comfyui-ws-client.js');
    const wsClient = getWSClient();
    await wsClient.connect();
    useWebSocket = true;
  } catch {
    // Fallback to polling
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const workflow = await resolveStepWorkflow(step);
      if ((step.inputFrom != null) !== (step.outputTo != null)) {
        throw new Error('inputFrom and outputTo must be provided together');
      }
      if (step.inputFrom && step.outputTo != null) {
        const { step: sourceStep, outputNode, outputIndex } = step.inputFrom;
        if (!Number.isInteger(sourceStep) || sourceStep < 0 || sourceStep >= i) {
          throw new Error('inputFrom.step must reference an earlier step');
        }
        const previous = results[sourceStep];
        if (previous?.status !== 'completed') {
          throw new Error(`Cannot use output from failed step ${sourceStep}`);
        }
        if (!Number.isInteger(outputIndex) || outputIndex < 0) {
          throw new Error('inputFrom.outputIndex must be a non-negative image index');
        }
        const nodeId = findNodeWithInput(workflow, step.outputTo);
        if (!nodeId) throw new Error(`No target node has input "${step.outputTo}"`);
        const output = previous.outputs && Object.hasOwn(previous.outputs, outputNode)
          ? previous.outputs[outputNode] as { images?: Array<{ filename?: string; subfolder?: string; type?: string }> }
          : undefined;
        const image = output?.images?.[outputIndex];
        if (!image || typeof image.filename !== 'string' || !image.filename) {
          throw new Error(`No image at output node "${outputNode}" index ${outputIndex} in step ${sourceStep}`);
        }
        const bytes = await comfyui.fetchOutputByFilename(image.filename, { subfolder: image.subfolder, type: image.type ?? 'output' });
        const uploaded = await comfyui.uploadImage(bytes, image.filename);
        workflow[nodeId].inputs[step.outputTo] = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
      }
      const result = useWebSocket
        ? await comfyui.submitPromptAndWaitWithProgress(workflow, timeoutMs)
        : await comfyui.submitPromptAndWait(workflow, timeoutMs);

      results.push({
        stepIndex: i,
        prompt_id: result.prompt_id,
        status: result.status === 'completed' ? 'completed' : 'failed',
        outputs: result.outputs,
        error: result.error,
      });
    } catch (e) {
      results.push({
        stepIndex: i,
        prompt_id: '',
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (stopOnError && results[results.length - 1].status === 'failed') {
      return results;
    }
  }

  return results;
}
