/**
 * Output manager: list and download ComfyUI prompt outputs (images, etc.).
 * Uses GET /history and GET /view.
 * When return_base64 and size > 800KB, converts to WebP to stay under typical 1MB base64 limits.
 */
import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';
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

const LIST_OUTPUTS_RETRY_DELAY_MS = 2000;
const LIST_OUTPUTS_MAX_RETRIES = 3;

/** ComfyUI history status_str values that mean execution is finished. */
const FINAL_STATUS_STRINGS = ['success', 'finished', 'error', 'canceled', 'cached'];

function isHistoryEntryFinal(entry: HistoryEntry): boolean {
  const statusObj = entry.status as { status_str?: string; messages?: unknown[] } | undefined;
  const statusStr = statusObj?.status_str?.toLowerCase();
  const hasError = Boolean(statusObj?.messages?.length);
  if (hasError) return true;
  if (statusStr && FINAL_STATUS_STRINGS.includes(statusStr)) return true;
  const hasOutputs = Boolean(entry.outputs && Object.keys(entry.outputs).length > 0);
  return hasOutputs;
}

export interface ListOutputsOptions {
  /** Delay in ms between retries (default LIST_OUTPUTS_RETRY_DELAY_MS). Use 0 in tests to avoid real delay. */
  retryDelayMs?: number;
}

/**
 * List all output files for a completed prompt (from GET /history).
 * If GET /history/{prompt_id} returns empty (e.g. fresh prompt), fallback to full history.
 * Retries up to LIST_OUTPUTS_MAX_RETRIES with delay — ComfyUI may need ~2s to write to history after completed.
 * Throws if prompt is still running/pending so the caller can show a clear message instead of "No outputs".
 */
export async function listOutputs(promptId: string, options?: ListOutputsOptions): Promise<OutputFile[]> {
  const delayMs = options?.retryDelayMs ?? LIST_OUTPUTS_RETRY_DELAY_MS;
  const tryList = async (): Promise<OutputFile[]> => {
    let entries = (await comfyui.getHistory(promptId)) ?? [];
    if (entries.length === 0) {
      const allEntries = (await comfyui.getHistory()) ?? [];
      const match = allEntries.find((e) => (e.prompt_id ?? '').toString() === promptId);
      if (match) entries = [match];
    }
    if (entries.length === 0) return [];

    const entry = entries[0];
    const statusObj = entry.status as { status_str?: string } | undefined;
    const statusStr = statusObj?.status_str?.toLowerCase();
    const hasOutputs = entry.outputs && Object.keys(entry.outputs ?? {}).length > 0;

    if (!hasOutputs && statusStr && !FINAL_STATUS_STRINGS.includes(statusStr)) {
      throw new Error(
        `Prompt ${promptId} is not completed yet (status: ${statusStr}). Try list_outputs again in a few seconds.`
      );
    }

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
  };

  for (let attempt = 0; attempt < LIST_OUTPUTS_MAX_RETRIES; attempt++) {
    try {
      const files = await tryList();
      if (files.length > 0) return files;
    } catch (e) {
      if (attempt === LIST_OUTPUTS_MAX_RETRIES - 1) throw e;
    }
    if (attempt < LIST_OUTPUTS_MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return [];
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

const BASE64_CONVERT_THRESHOLD_BYTES = 800 * 1024; // 800 KB — auto-convert to WebP when larger
const WEBP_QUALITY = 85;

export type OutputImageFormat = 'png' | 'jpeg' | 'webp';

const IMAGE_EXT = /\.(png|jpg|jpeg|webp|gif)$/i;

function getMimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

/** Convert image buffer to the requested format. Returns buffer, mime, and new filename extension. */
async function convertImageToFormat(
  buffer: Buffer,
  format: OutputImageFormat,
  quality: number
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const s = sharp(buffer);
  if (format === 'png') {
    const out = await s.png().toBuffer();
    return { buffer: Buffer.from(out), mime: 'image/png', ext: 'png' };
  }
  if (format === 'jpeg') {
    const out = await s.jpeg({ quality }).toBuffer();
    return { buffer: Buffer.from(out), mime: 'image/jpeg', ext: 'jpg' };
  }
  const out = await s.webp({ quality }).toBuffer();
  return { buffer: Buffer.from(out), mime: 'image/webp', ext: 'webp' };
}

/**
 * Download an output file by filename (no prompt_id needed). Uses GET /view.
 * Use when you have filename from get_history or get_last_output.
 * Returns the written path and size in bytes.
 * When returnBase64 is true, does not write to disk; returns base64 data for remote MCP.
 * If size > 800 KB, automatically converts to WebP (quality 85) to stay under typical 1MB base64 limits.
 * Use output_format to always convert to png, jpeg, or webp (e.g. for smaller files or compatibility).
 */
export async function downloadByFilename(
  filename: string,
  destPath: string,
  options?: {
    subfolder?: string;
    type?: string;
    returnBase64?: boolean;
    /** When return_base64 and size > this (bytes), convert to WebP. Default 800*1024. Set 0 to disable. */
    max_base64_bytes?: number;
    /** Quality for WebP/JPEG conversion (1–100). Default 85. */
    convert_quality?: number;
    /** Force output format: png, jpeg, or webp. Conversion is done server-side with sharp. */
    output_format?: OutputImageFormat;
  }
): Promise<
  | { path: string; size: number }
  | { filename: string; mime: string; encoding: 'base64'; data: string; converted?: boolean; original_size?: number }
> {
  const bytes = await comfyui.fetchOutputByFilename(filename, {
    subfolder: options?.subfolder,
    type: options?.type ?? 'output',
  });
  let buffer: Buffer = Buffer.from(bytes);
  const quality = Math.min(100, Math.max(1, options?.convert_quality ?? WEBP_QUALITY));
  const ext = filename.split('.').pop()?.toLowerCase();
  const isImage = ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif';

  // Explicit format: always convert to requested format when the file is an image.
  if (options?.output_format && isImage) {
    try {
      const { buffer: converted, mime, ext: outExt } = await convertImageToFormat(buffer, options.output_format, quality);
      buffer = Buffer.from(converted);
      const outFilename = filename.replace(IMAGE_EXT, `.${outExt}`);

      if (options?.returnBase64) {
        return {
          filename: outFilename,
          mime,
          encoding: 'base64',
          data: buffer.toString('base64'),
          converted: true,
          original_size: bytes.byteLength,
        };
      }
      const outPath = IMAGE_EXT.test(destPath) ? destPath.replace(IMAGE_EXT, `.${outExt}`) : `${destPath}.${outExt}`;
      const dir = dirname(outPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(outPath, buffer);
      return { path: outPath, size: buffer.length };
    } catch {
      // Fall through to original buffer if conversion fails
    }
  }

  if (options?.returnBase64) {
    const maxBytes = options.max_base64_bytes ?? BASE64_CONVERT_THRESHOLD_BYTES;
    let outBuffer = buffer;
    let mime = isImage ? getMimeForExt(ext!) : 'application/octet-stream';
    let outFilename = filename;
    let converted = false;
    if (isImage && maxBytes > 0 && buffer.length > maxBytes) {
      try {
        const { buffer: webpBuf, mime: webpMime, ext: webpExt } = await convertImageToFormat(buffer, 'webp', quality);
        outBuffer = Buffer.from(webpBuf);
        mime = webpMime;
        outFilename = filename.replace(IMAGE_EXT, `.${webpExt}`);
        converted = true;
      } catch {
        // Keep original if sharp fails
      }
    }
    return {
      filename: outFilename,
      mime,
      encoding: 'base64',
      data: outBuffer.toString('base64'),
      ...(converted && { converted: true, original_size: buffer.length }),
    };
  }

  const dir = dirname(destPath);
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(destPath, buffer);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT' || e?.code === 'EACCES') {
      throw new Error(
        `${e.code}: ${e.message}. dest_path is resolved on the machine where the MCP server runs. ` +
          'If the server runs in a different environment (e.g. host vs container), use return_base64: true and save the file on the client side.'
      );
    }
    throw err;
  }
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
