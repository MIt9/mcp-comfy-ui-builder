/**
 * Batch executor: run multiple workflows with configurable concurrency.
 * Uses WebSocket for real-time progress (with polling fallback).
 */
import * as comfyui from '../comfyui-client.js';
import type { ComfyUIWorkflow, ExecutionResult } from '../types/comfyui-api-types.js';

export interface ExecutionProgress {
  prompt_id: string;
  status: 'queued' | 'started' | 'executing' | 'completed' | 'error';
  current_node?: string;
  current_node_progress?: number;
  queue_position?: number;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface BatchConfig {
  workflows: ComfyUIWorkflow[];
  concurrency?: number;
  stopOnError?: boolean;
  timeoutMs?: number;
  onProgress?: (index: number, total: number, result: ExecutionResult) => void;
}

export interface BatchResult {
  index: number;
  prompt_id: string;
  status: 'completed' | 'failed';
  outputs?: Record<string, unknown>;
  error?: string;
}

/**
 * Execute workflows in batches. Up to concurrency run at a time.
 * Pre-connects WebSocket for optimized batch execution (single connection vs multiple polling loops).
 */
export async function executeBatch(config: BatchConfig): Promise<BatchResult[]> {
  const { workflows, concurrency = 1, stopOnError = false, timeoutMs = 300_000, onProgress } = config;
  const results: BatchResult[] = [];
  const queue = workflows.map((w, i) => ({ workflow: w, index: i }));
  const running: Promise<void>[] = [];
  const maxConcurrency = Math.max(1, concurrency);

  // Pre-connect WebSocket for batch execution (reduces overhead from multiple polling loops)
  let useWebSocket = false;
  try {
    const { getWSClient } = await import('../comfyui-ws-client.js');
    const wsClient = getWSClient();
    await wsClient.connect();
    useWebSocket = true;
  } catch {
    // Fallback to polling
  }

  async function runOne(item: (typeof queue)[0]): Promise<void> {
    let result: ExecutionResult;
    try {
      result = useWebSocket
        ? await comfyui.submitPromptAndWaitWithProgress(item.workflow, timeoutMs)
        : await comfyui.submitPromptAndWait(item.workflow, timeoutMs);
    } catch (e) {
      result = {
        prompt_id: '',
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      };
    }
    results.push({ index: item.index, prompt_id: result.prompt_id, status: result.status === 'completed' ? 'completed' : 'failed', outputs: result.outputs, error: result.error });
    // Observer failures must not duplicate results or change execution outcomes.
    try { onProgress?.(item.index, workflows.length, result); } catch { /* Execution result remains authoritative. */ }
  }

  while (queue.length > 0 || running.length > 0) {
    if (stopOnError && results.some((r) => r.status === 'failed')) {
      await Promise.all(running);
      break;
    }
    while (running.length < maxConcurrency && queue.length > 0) {
      const item = queue.shift()!;
      const promise = runOne(item).then(() => {
        const i = running.indexOf(promise);
        if (i >= 0) running.splice(i, 1);
      });
      running.push(promise);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}
