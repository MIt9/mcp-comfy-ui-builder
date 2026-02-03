/**
 * ComfyUI API client: submit prompt, get history, get queue.
 * Base URL from COMFYUI_HOST (default http://127.0.0.1:8188).
 */
import fetch from 'node-fetch';
import type {
  ComfyUIWorkflow,
  SubmitPromptResponse,
  HistoryEntry,
  HistoryNodeOutput,
  QueueStatus,
  ObjectInfo,
  ExecutionResult,
  SystemStatsResponse,
} from './types/comfyui-api-types.js';

const DEFAULT_HOST = 'http://127.0.0.1:8188';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

function getBaseUrl(): string {
  return process.env.COMFYUI_HOST ?? DEFAULT_HOST;
}

function normalizeUrl(url: string): string {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

type FetchOptions = { method?: string; body?: string; timeout?: number };

async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Awaited<ReturnType<typeof fetch>>> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(normalizeUrl(url), {
        method: options.method ?? 'GET',
        body: options.body,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(id);
      return res;
    } catch (e) {
      lastError = e as Error;
      if (attempt === MAX_RETRIES) {
        clearTimeout(id);
        throw lastError;
      }
    }
  }
  clearTimeout(id);
  throw lastError ?? new Error('Request failed');
}

/**
 * Submit a workflow to ComfyUI. POST /prompt with body { prompt: workflow }.
 * Returns prompt_id.
 */
export async function submitPrompt(workflow: ComfyUIWorkflow): Promise<SubmitPromptResponse> {
  const res = await fetchWithRetry('/prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /prompt failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as SubmitPromptResponse;
  if (!data?.prompt_id) {
    throw new Error('ComfyUI /prompt did not return prompt_id');
  }
  return data;
}

/**
 * Get history. GET /history or GET /history/{prompt_id}.
 * Returns array of history entries (or single entry when prompt_id given).
 */
export async function getHistory(promptId?: string): Promise<HistoryEntry[]> {
  const path = promptId ? `/history/${encodeURIComponent(promptId)}` : '/history';
  const res = await fetchWithRetry(path, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI ${path} failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  if (promptId && data && typeof data === 'object' && !Array.isArray(data)) {
    // ComfyUI GET /history/{id} can return flat { outputs, status } or keyed { [prompt_id]: { outputs, status } }
    const keyed = data as Record<string, unknown>;
    const entry =
      keyed[promptId] != null
        ? (keyed[promptId] as HistoryEntry)
        : (keyed.outputs != null && keyed.status != null ? data : Object.values(keyed)[0]) as HistoryEntry;
    const withId = entry && typeof entry === 'object' ? { ...entry, prompt_id: promptId } : (data as HistoryEntry);
    return [withId as HistoryEntry];
  }
  if (Array.isArray(data)) {
    const arr = data as HistoryEntry[];
    return arr.length > 1 ? [...arr].reverse() : arr; // newest first (ComfyUI array is often oldest-first)
  }
  // ComfyUI GET /history (no prompt_id) can return object keyed by prompt_id
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, HistoryEntry>).map(([id, entry]) => ({
      ...entry,
      prompt_id: id,
    })) as HistoryEntry[];
    return entries.reverse(); // newest first
  }
  return [];
}

/**
 * Get node definitions from running ComfyUI. GET /object_info.
 * Returns map of class name -> { input, output, output_name, category, description }.
 * Requires ComfyUI to be running; throws if request fails.
 */
export async function getObjectInfo(): Promise<ObjectInfo> {
  const res = await fetchWithRetry('/object_info', { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /object_info failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as ObjectInfo;
  return data ?? {};
}

/**
 * Get system stats (GPU/VRAM/RAM). GET /system_stats.
 * Requires ComfyUI to be running. Values are in bytes.
 */
export async function getSystemStats(): Promise<SystemStatsResponse> {
  const res = await fetchWithRetry('/system_stats', { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /system_stats failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as SystemStatsResponse;
  if (!data?.system || !Array.isArray(data.devices)) {
    throw new Error('ComfyUI /system_stats returned invalid structure');
  }
  return data;
}

/**
 * Get queue status. GET /queue.
 */
export async function getQueue(): Promise<QueueStatus> {
  const res = await fetchWithRetry('/queue', { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /queue failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as QueueStatus;
  return {
    queue_running: data?.queue_running ?? [],
    queue_pending: data?.queue_pending ?? [],
  };
}

/**
 * Interrupt currently running workflow. POST /interrupt.
 * Optionally pass prompt_id to interrupt only that prompt (if it is running).
 */
export async function interruptExecution(promptId?: string): Promise<void> {
  const body = promptId ? JSON.stringify({ prompt_id: promptId }) : '{}';
  const res = await fetchWithRetry('/interrupt', {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /interrupt failed (${res.status}): ${text || res.statusText}`);
  }
}

/**
 * Clear queue: wipe all pending and running. POST /queue with { clear: true }.
 */
export async function clearQueue(): Promise<void> {
  const res = await fetchWithRetry('/queue', {
    method: 'POST',
    body: JSON.stringify({ clear: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI POST /queue failed (${res.status}): ${text || res.statusText}`);
  }
}

/**
 * Delete specific queue items by prompt_id. POST /queue with { delete: [prompt_id, ...] }.
 */
export async function deleteQueueItems(promptIds: string[]): Promise<void> {
  if (promptIds.length === 0) return;
  const res = await fetchWithRetry('/queue', {
    method: 'POST',
    body: JSON.stringify({ delete: promptIds }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI POST /queue delete failed (${res.status}): ${text || res.statusText}`);
  }
}

/**
 * Check if ComfyUI is configured. Always true by default — uses COMFYUI_HOST if set,
 * otherwise http://127.0.0.1:8188. No env needed for local ComfyUI.
 */
export function isComfyUIConfigured(): boolean {
  return true;
}

/** First image from history entry for a prompt (filename + subfolder + type). */
export interface OutputImageRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

/**
 * Get the first output image reference from history for a prompt.
 * Use with fetchOutputImageBytes then uploadImage to reuse in another workflow.
 */
export function getFirstOutputImageRef(entries: HistoryEntry[]): OutputImageRef | null {
  if (!entries.length) return null;
  const outputs = entries[0].outputs ?? {};
  for (const out of Object.values(outputs)) {
    const images = (out as HistoryNodeOutput).images;
    if (images?.length) {
      const img = images[0];
      return {
        filename: img.filename,
        subfolder: img.subfolder,
        type: img.type ?? 'output',
      };
    }
  }
  return null;
}

/**
 * Fetch file bytes from ComfyUI /view by filename (no prompt_id needed).
 * Use when you have filename from get_history or get_last_output.
 */
export async function fetchOutputByFilename(
  filename: string,
  options?: { subfolder?: string; type?: string }
): Promise<ArrayBuffer> {
  const base = getBaseUrl().replace(/\/$/, '');
  const params = new URLSearchParams({
    filename,
    type: options?.type ?? 'output',
    ...(options?.subfolder ? { subfolder: options.subfolder } : {}),
  });
  const url = `${base}/view?${params.toString()}`;
  const res = await fetchWithRetry(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /view failed (${res.status}): ${text || res.statusText}`);
  }
  return res.arrayBuffer();
}

/**
 * Fetch image bytes from ComfyUI /view for a given prompt_id.
 * Returns buffer and suggested filename for upload. Fails if prompt has no image output.
 */
export async function fetchOutputImageBytes(promptId: string): Promise<{ bytes: ArrayBuffer; filename: string }> {
  const entries = await getHistory(promptId);
  const ref = getFirstOutputImageRef(entries);
  if (!ref) {
    throw new Error(`No image output found in history for prompt_id: ${promptId}`);
  }
  const bytes = await fetchOutputByFilename(ref.filename, {
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return { bytes, filename: ref.filename };
}

/** Response from POST /upload/image. */
export interface UploadImageResponse {
  name: string;
  subfolder: string;
  type: string;
}

/**
 * Upload image bytes to ComfyUI input folder. POST /upload/image (multipart).
 * Returns the filename to use in LoadImage (name; subfolder may be needed for nested paths).
 */
export async function uploadImage(imageBytes: ArrayBuffer, suggestedFilename: string): Promise<UploadImageResponse> {
  const form = new FormData();
  const blob = new Blob([imageBytes], { type: 'image/png' });
  form.append('image', blob, suggestedFilename);
  const res = await fetch(normalizeUrl('upload/image'), {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: form as any,
    headers: {}, // do not set Content-Type; FormData sets multipart boundary
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /upload/image failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as UploadImageResponse;
  if (!data?.name) {
    throw new Error('ComfyUI /upload/image did not return name');
  }
  return data;
}

/**
 * Fetch the first output image from a completed prompt and upload it to ComfyUI input.
 * Returns the filename to use in LoadImage for a follow-up workflow (e.g. image caption / verify).
 */
export async function prepareImageForWorkflow(promptId: string): Promise<UploadImageResponse> {
  const { bytes, filename } = await fetchOutputImageBytes(promptId);
  return uploadImage(bytes, filename);
}

const POLL_INTERVAL_MS = 1500;
const DEFAULT_SYNC_TIMEOUT_MS = 300_000; // 5 minutes
const POLL_FALLBACK_DELAY_MS = 3000; // delay before polling when WS shows 100% but no completed event
const POLL_FALLBACK_TIMEOUT_MS = 10_000; // short poll timeout (execution already done on disk)

/**
 * Submit workflow and wait until execution completes (polling GET /history).
 * Returns prompt_id, status (completed/failed/timeout), and outputs from history.
 */
export async function submitPromptAndWait(
  workflow: ComfyUIWorkflow,
  timeoutMs: number = DEFAULT_SYNC_TIMEOUT_MS
): Promise<ExecutionResult> {
  const { prompt_id } = await submitPrompt(workflow);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = await getHistory(prompt_id);
    if (entries.length > 0) {
      const entry = entries[0];
      const statusStr = (entry.status as { status_str?: string } | undefined)?.status_str;
      const messages = (entry.status as { messages?: unknown[] } | undefined)?.messages;
      const hasError = Boolean(messages?.length);
      return {
        prompt_id,
        status: hasError ? 'failed' : 'completed',
        outputs: entry.outputs,
        error: hasError ? String(messages?.[0]) : undefined,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { prompt_id, status: 'timeout', error: `Timed out after ${timeoutMs}ms` };
}

/**
 * Submit workflow and wait with WebSocket progress tracking (hybrid approach).
 * Tries WebSocket first for real-time updates, falls back to polling if unavailable.
 * Always returns an object with prompt_id so the client can use get_history/get_last_output if needed.
 * @param workflow - ComfyUI workflow to execute
 * @param timeoutMs - Maximum wait time in milliseconds
 * @param onProgress - Optional callback for progress updates (only with WebSocket)
 * @returns Execution result with status and outputs (prompt_id always present)
 */
export async function submitPromptAndWaitWithProgress(
  workflow: ComfyUIWorkflow,
  timeoutMs: number = DEFAULT_SYNC_TIMEOUT_MS,
  onProgress?: (progress: import('./types/comfyui-api-types.js').ExecutionProgress) => void
): Promise<ExecutionResult> {
  const { prompt_id } = await submitPrompt(workflow);
  try {
    return await waitForCompletion(prompt_id, timeoutMs, onProgress);
  } catch (e) {
    return {
      prompt_id,
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Wait for execution completion (WebSocket + polling in parallel).
 * Runs both WebSocket and polling from the start; first to return completed/failed wins.
 * Handles MPS/macOS where WebSocket may not receive progress events — polling resolves via GET /history.
 */
export async function waitForCompletion(
  promptId: string,
  timeoutMs: number = DEFAULT_SYNC_TIMEOUT_MS,
  onProgress?: (progress: import('./types/comfyui-api-types.js').ExecutionProgress) => void
): Promise<ExecutionResult> {
  const wsPromise = (async (): Promise<ExecutionResult | null> => {
    try {
      const { getWSClient } = await import('./comfyui-ws-client.js');
      const wsClient = getWSClient();
      await wsClient.connect();
      return await waitWithWebSocket(wsClient, promptId, timeoutMs, onProgress);
    } catch {
      return null;
    }
  })();

  const pollPromise = waitWithPolling(promptId, timeoutMs);

  const result = await Promise.race([
    wsPromise.then((r) =>
      r && (r.status === 'completed' || r.status === 'failed') ? r : pollPromise
    ),
    pollPromise,
  ]);

  return result;
}

/**
 * Wait for execution completion using WebSocket
 * Falls back to polling when progress reaches 100% but completed event never arrives (e.g. MPS/macOS).
 */
async function waitWithWebSocket(
  wsClient: Awaited<ReturnType<typeof import('./comfyui-ws-client.js').getWSClient>>,
  promptId: string,
  timeoutMs: number,
  onProgress?: (progress: import('./types/comfyui-api-types.js').ExecutionProgress) => void
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    let subscription: ReturnType<typeof wsClient.subscribe> | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let pollFallbackId: NodeJS.Timeout | null = null;
    let completedOrResolving = false;
    let pollFallbackScheduled = false;

    const cleanup = () => {
      if (subscription) subscription.unsubscribe();
      subscription = null;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      if (pollFallbackId) clearTimeout(pollFallbackId);
      pollFallbackId = null;
    };

    subscription = wsClient.subscribe(
      promptId,
      (progress) => {
        onProgress?.(progress);

        if (progress.status === 'completed') {
          completedOrResolving = true;
          cleanup();
          resolve({
            prompt_id: promptId,
            status: 'completed',
            outputs: progress.outputs,
          });
        } else if (progress.status === 'failed') {
          completedOrResolving = true;
          cleanup();
          resolve({
            prompt_id: promptId,
            status: 'failed',
            error: progress.error?.message,
          });
        } else if (
          !completedOrResolving &&
          !pollFallbackScheduled &&
          progress.current_node_progress !== undefined &&
          progress.current_node_progress >= 1
        ) {
          pollFallbackScheduled = true;
          completedOrResolving = true;
          pollFallbackId = setTimeout(async () => {
            cleanup();
            const result = await waitWithPolling(promptId, POLL_FALLBACK_TIMEOUT_MS);
            resolve(result);
          }, POLL_FALLBACK_DELAY_MS);
        }
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );

    timeoutId = setTimeout(() => {
      cleanup();
      resolve({
        prompt_id: promptId,
        status: 'timeout',
        error: `Timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });
}

/**
 * Wait for execution completion using polling (fallback)
 */
async function waitWithPolling(promptId: string, timeoutMs: number): Promise<ExecutionResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entries = await getHistory(promptId);
    if (entries.length > 0) {
      const entry = entries[0];
      const statusStr = (entry.status as { status_str?: string } | undefined)?.status_str;
      const messages = (entry.status as { messages?: unknown[] } | undefined)?.messages;
      const hasError = Boolean(messages?.length);
      return {
        prompt_id: promptId,
        status: hasError ? 'failed' : 'completed',
        outputs: entry.outputs,
        error: hasError ? String(messages?.[0]) : undefined,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { prompt_id: promptId, status: 'timeout', error: `Timed out after ${timeoutMs}ms` };
}

/**
 * Check if WebSocket connection is available
 */
export async function isWebSocketAvailable(): Promise<boolean> {
  try {
    const { getWSClient } = await import('./comfyui-ws-client.js');
    const wsClient = getWSClient();
    return wsClient.isConnected();
  } catch {
    return false;
  }
}
