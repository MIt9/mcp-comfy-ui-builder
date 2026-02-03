/**
 * Output manager: list and download ComfyUI prompt outputs (images, etc.).
 * Uses GET /history and GET /view.
 */
import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import * as comfyui from './comfyui-client.js';
import type { HistoryEntry, HistoryNodeOutput, HistoryImageOutput } from './types/comfyui-api-types.js';

const DEFAULT_HOST = 'http://127.0.0.1:8188';

function getBaseUrl(): string {
  const base = process.env.COMFYUI_HOST ?? DEFAULT_HOST;
  return base.replace(/\/$/, '');
}

export interface OutputFile {
  prompt_id: string;
  node_id: string;
  type: 'image' | 'text' | 'audio' | 'video' | 'gif';
  filename: string;
  subfolder: string;
  url: string;
}

function buildViewUrl(filename: string, subfolder?: string, type: string = 'output'): string {
  const params = new URLSearchParams({ filename, type });
  if (subfolder) params.set('subfolder', subfolder);
  return `${getBaseUrl()}/view?${params.toString()}`;
}

/**
 * List all output files for a completed prompt (from GET /history).
 */
export async function listOutputs(promptId: string): Promise<OutputFile[]> {
  const entries = await comfyui.getHistory(promptId);
  if (entries.length === 0) {
    return [];
  }
  const entry = entries[0];
  const outputs = entry.outputs ?? {};
  const files: OutputFile[] = [];
  for (const [nodeId, out] of Object.entries(outputs)) {
    const nodeOut = out as HistoryNodeOutput;
    const images = nodeOut.images ?? [];
    for (const img of images) {
      const i = img as HistoryImageOutput;
      files.push({
        prompt_id: promptId,
        node_id: nodeId,
        type: 'image',
        filename: i.filename,
        subfolder: i.subfolder ?? '',
        url: buildViewUrl(i.filename, i.subfolder, i.type ?? 'output'),
      });
    }
    const gifs = (nodeOut as { gifs?: HistoryImageOutput[] }).gifs ?? [];
    for (const g of gifs) {
      files.push({
        prompt_id: promptId,
        node_id: nodeId,
        type: 'gif',
        filename: g.filename,
        subfolder: g.subfolder ?? '',
        url: buildViewUrl(g.filename, g.subfolder, g.type ?? 'output'),
      });
    }
  }
  return files;
}

/**
 * Download a single output file to destPath. Creates parent directory if needed.
 * Returns the written path.
 */
export async function downloadOutput(file: OutputFile, destPath: string): Promise<string> {
  const res = await fetch(file.url);
  if (!res.ok) {
    throw new Error(`ComfyUI /view failed (${res.status}): ${file.url}`);
  }
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buffer);
  return destPath;
}

/**
 * Download an output file by filename (no prompt_id needed). Uses GET /view.
 * Use when you have filename from get_history or get_last_output.
 * Returns the written path and size in bytes.
 */
export async function downloadByFilename(
  filename: string,
  destPath: string,
  options?: { subfolder?: string; type?: string }
): Promise<{ path: string; size: number }> {
  const bytes = await comfyui.fetchOutputByFilename(filename, {
    subfolder: options?.subfolder,
    type: options?.type ?? 'output',
  });
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const buffer = Buffer.from(bytes);
  writeFileSync(destPath, buffer);
  return { path: destPath, size: buffer.length };
}

/**
 * Download all outputs for a prompt into destDir. Returns paths written.
 * Filenames are kept; subfolder is flattened or used as subdir if desired.
 * Default: write all into destDir with node_id prefix to avoid collisions (e.g. 7_00001.png).
 */
export async function downloadAllOutputs(
  promptId: string,
  destDir: string,
  options?: { prefixNodeId?: boolean }
): Promise<string[]> {
  const files = await listOutputs(promptId);
  const paths: string[] = [];
  const prefix = options?.prefixNodeId !== false;
  for (const file of files) {
    const baseName = prefix ? `${file.node_id}_${file.filename}` : file.filename;
    const destPath = join(destDir, baseName);
    await downloadOutput(file, destPath);
    paths.push(destPath);
  }
  return paths;
}
