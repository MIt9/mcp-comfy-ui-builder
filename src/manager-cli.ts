/**
 * Run ComfyUI-Manager cm-cli (custom nodes) and model download (comfy-cli or fetch).
 * Requires COMFYUI_PATH for installs. Optional: comfy-cli in PATH for model download.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fetch from 'node-fetch';

const COMFYUI_PATH_ENV = 'COMFYUI_PATH';

/** Standard model type → relative path from ComfyUI root. */
export const MODEL_TYPE_PATHS: Record<string, string> = {
  checkpoint: 'models/checkpoints',
  checkpoints: 'models/checkpoints',
  lora: 'models/loras',
  loras: 'models/loras',
  vae: 'models/vae',
  controlnet: 'models/controlnet',
  clip: 'models/clip',
  embeddings: 'embeddings',
  hypernetwork: 'models/hypernetworks',
  hypernetworks: 'models/hypernetworks',
  upscale_models: 'models/upscale_models',
  clip_vision: 'models/clip_vision',
  unet: 'models/unet',
  diffusers: 'models/diffusers',
};

export function getComfyPath(): string | undefined {
  const raw = process.env[COMFYUI_PATH_ENV];
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function isManagerCliConfigured(): boolean {
  const path = getComfyPath();
  if (!path) return false;
  const cmCliPath = join(path, 'custom_nodes', 'ComfyUI-Manager', 'cm-cli.py');
  return existsSync(cmCliPath);
}

/**
 * Run cm-cli.py with given args (e.g. ['install', 'ComfyUI-Blip']).
 * cwd = COMFYUI_PATH. Uses system 'python3' or 'python'.
 */
export function runCmCli(args: string[]): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  const base = getComfyPath();
  if (!base) {
    return {
      ok: false,
      stdout: '',
      stderr: `COMFYUI_PATH is not set. Set it to your ComfyUI installation directory (e.g. /path/to/ComfyUI).`,
      code: null,
    };
  }
  const cmCliPath = join(base, 'custom_nodes', 'ComfyUI-Manager', 'cm-cli.py');
  if (!existsSync(cmCliPath)) {
    return {
      ok: false,
      stdout: '',
      stderr: `ComfyUI-Manager not found at ${cmCliPath}. Install ComfyUI-Manager in your ComfyUI custom_nodes.`,
      code: null,
    };
  }
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const richCheck = checkRichAvailable(python, base);
  if (!richCheck.available) {
    return {
      ok: false,
      stdout: '',
      stderr:
        richCheck.message ??
        "ComfyUI-Manager cm-cli requires the Python package 'rich'. Run: pip install rich (in your ComfyUI Python environment).",
      code: null,
    };
  }
  const child = spawnSync(python, [cmCliPath, ...args], {
    cwd: base,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const stdout = (child.stdout ?? '') as string;
  const stderr = (child.stderr ?? '') as string;
  const code = child.status;
  return {
    ok: code === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    code: code ?? null,
  };
}

/**
 * Check if the Python used for cm-cli has the 'rich' module (required by ComfyUI-Manager cm-cli).
 * Uses the same python executable and cwd as runCmCli for consistency.
 */
export function checkRichAvailable(
  python: string = process.platform === 'win32' ? 'python' : 'python3',
  cwd?: string
): { available: boolean; message?: string } {
  const child = spawnSync(python, ['-c', 'import rich'], {
    encoding: 'utf8',
    timeout: 5000,
    cwd: cwd ?? undefined,
  });
  if (child.status === 0) {
    return { available: true };
  }
  const stderr = (child.stderr ?? '') as string;
  const msg = stderr.trim() || "ModuleNotFoundError: No module named 'rich'";
  return {
    available: false,
    message: `ComfyUI-Manager requires the Python package 'rich'. Run: pip install rich (in your ComfyUI Python environment). Original: ${msg}`,
  };
}

/**
 * Run comfy model download --url <url> --relative-path <path>. Requires comfy-cli in PATH.
 */
export function runComfyModelDownload(
  url: string,
  relativePath: string
): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  const base = getComfyPath();
  if (!base) {
    return {
      ok: false,
      stdout: '',
      stderr: 'COMFYUI_PATH is not set.',
      code: null,
    };
  }
  const child = spawnSync('comfy', ['model', 'download', '--url', url, '--relative-path', relativePath], {
    cwd: base,
    encoding: 'utf8',
    timeout: 600_000,
    shell: process.platform === 'win32',
  });
  const stdout = (child.stdout ?? '') as string;
  const stderr = (child.stderr ?? '') as string;
  const code = child.status;
  return {
    ok: code === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    code: code ?? null,
  };
}

/** Check if comfy-cli is available in PATH. */
export function isComfyCliAvailable(): boolean {
  const child = spawnSync('comfy', ['--help'], { encoding: 'utf8', timeout: 5000, shell: process.platform === 'win32' });
  return child.status === 0;
}

/**
 * Resolve model type to relative path (e.g. 'lora' -> 'models/loras').
 */
export function getRelativePathForModelType(modelType: string): string {
  const key = modelType.toLowerCase().trim();
  return MODEL_TYPE_PATHS[key] ?? `models/${key}`;
}

/**
 * Download file from URL and save to destDir. Creates dir if needed.
 * Filename from Content-Disposition or URL path.
 */
export async function downloadModelToDir(
  url: string,
  destDir: string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const base = getComfyPath();
  if (!base) {
    return { ok: false, error: 'COMFYUI_PATH is not set.' };
  }
  const absoluteDir = join(base, destDir);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      return { ok: false, error: `Download failed: ${res.status} ${res.statusText}` };
    }
    let filename: string | undefined;
    const cd = res.headers.get('content-disposition');
    if (cd) {
      const match = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i.exec(cd) ?? /filename="?([^";\n]+)"?/i.exec(cd);
      if (match?.[1]) filename = match[1].trim().replace(/^["']|["']$/g, '');
    }
    if (!filename) {
      try {
        const u = new URL(url);
        const pathname = u.pathname;
        filename = pathname.slice(pathname.lastIndexOf('/') + 1) || 'model.safetensors';
      } catch {
        filename = 'model.safetensors';
      }
    }
    if (!/^[\w.\-()+]+$/i.test(filename)) {
      filename = filename.replace(/[^\w.\-()+]/g, '_') || 'model.safetensors';
    }
    mkdirSync(absoluteDir, { recursive: true });
    const filePath = join(absoluteDir, filename);
    const buf = await res.arrayBuffer();
    writeFileSync(filePath, new Uint8Array(buf));
    return { ok: true, path: join(destDir, filename) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
