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
    return [data as HistoryEntry];
  }
  return Array.isArray(data) ? (data as HistoryEntry[]) : [];
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
 * Fetch image bytes from ComfyUI /view for a given prompt_id.
 * Returns buffer and suggested filename for upload. Fails if prompt has no image output.
 */
export async function fetchOutputImageBytes(promptId: string): Promise<{ bytes: ArrayBuffer; filename: string }> {
  const entries = await getHistory(promptId);
  const ref = getFirstOutputImageRef(entries);
  if (!ref) {
    throw new Error(`No image output found in history for prompt_id: ${promptId}`);
  }
  const base = getBaseUrl().replace(/\/$/, '');
  const params = new URLSearchParams({
    filename: ref.filename,
    type: ref.type ?? 'output',
    ...(ref.subfolder ? { subfolder: ref.subfolder } : {}),
  });
  const url = `${base}/view?${params.toString()}`;
  const res = await fetchWithRetry(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI /view failed (${res.status}): ${text || res.statusText}`);
  }
  const bytes = await res.arrayBuffer();
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
