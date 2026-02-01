/**
 * ComfyUI API client: submit prompt, get history, get queue.
 * Base URL from COMFYUI_HOST (default http://127.0.0.1:8188).
 */
import fetch from 'node-fetch';
import type {
  ComfyUIWorkflow,
  SubmitPromptResponse,
  HistoryEntry,
  QueueStatus,
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
 * Check if ComfyUI is configured. Always true by default — uses COMFYUI_HOST if set,
 * otherwise http://127.0.0.1:8188. No env needed for local ComfyUI.
 */
export function isComfyUIConfigured(): boolean {
  return true;
}
