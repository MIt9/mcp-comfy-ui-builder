/**
 * Fetch ComfyUI-Manager custom-node-list. Retry with backoff for network errors.
 */

import fetch from 'node-fetch';

const COMFYUI_MANAGER_LIST_URL =
  'https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/custom-node-list.json';

const DEFAULT_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

async function fetchWithRetry(
  url: string,
  options: Parameters<typeof fetch>[1] = {},
  retries: number = DEFAULT_RETRIES
): Promise<FetchResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options as Parameters<typeof fetch>[1]);
      if (res.status === 429 && attempt < retries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return res as FetchResponse;
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

export interface ManagerCustomNode {
  author?: string;
  title?: string;
  id?: string;
  reference?: string;
  files?: string[];
  install_type?: string;
  description?: string;
  nodename_pattern?: string;
}

export interface ManagerListResult {
  custom_nodes?: ManagerCustomNode[];
}

/**
 * Fetch ComfyUI-Manager custom-node-list.json and return parsed list.
 */
export async function fetchManagerList(): Promise<ManagerListResult> {
  const res = await fetchWithRetry(COMFYUI_MANAGER_LIST_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`ComfyUI-Manager list failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ManagerListResult;
}
