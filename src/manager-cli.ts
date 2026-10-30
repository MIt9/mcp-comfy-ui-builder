/**
 * Run ComfyUI-Manager cm-cli (custom nodes) and model download (comfy-cli or fetch).
 * Requires COMFYUI_PATH for installs. Optional: comfy-cli in PATH for model download.
 * restartComfyUI: kill process on COMFYUI_HOST port and start main.py from COMFYUI_PATH (so custom nodes are reloaded).
 */
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import fetch from 'node-fetch';

const COMFYUI_PATH_ENV = 'COMFYUI_PATH';
const COMFYUI_HOST_ENV = 'COMFYUI_HOST';
const DEFAULT_COMFYUI_HOST = 'http://127.0.0.1:8188';

/** Standard model type → relative path from ComfyUI root. */
export const MODEL_TYPE_PATHS: Record<string, string> = {
  checkpoint: 'models/checkpoints',
  checkpoints: 'models/checkpoints',
  lora: 'models/loras',
  loras: 'models/loras',
  vae: 'models/vae',
  controlnet: 'models/controlnet',
  clip: 'models/clip',
  embedding: 'models/embeddings',
  embeddings: 'models/embeddings',
  hypernetwork: 'models/hypernetworks',
  hypernetworks: 'models/hypernetworks',
  upscale_models: 'models/upscale_models',
  upscale: 'models/upscale_models',
  text_encoders: 'models/text_encoders',
  diffusion_models: 'models/diffusion_models',
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

/** Parse COMFYUI_HOST to host and port (default 8188). */
export function getComfyHostPort(): { host: string; port: number; baseUrl: string } {
  const raw = process.env[COMFYUI_HOST_ENV] ?? DEFAULT_COMFYUI_HOST;
  const url = raw.startsWith('http') ? raw : `http://${raw}`;
  try {
    const u = new URL(url);
    const port = u.port ? parseInt(u.port, 10) : 8188;
    const host = u.hostname || '127.0.0.1';
    u.port = String(port);
    const baseUrl = u.origin;
    return { host, port: Number.isFinite(port) ? port : 8188, baseUrl };
  } catch {
    return { host: '127.0.0.1', port: 8188, baseUrl: DEFAULT_COMFYUI_HOST };
  }
}

/** Get PIDs listening on the given port (Unix: lsof; Windows: netstat). */
function getPidsOnPort(port: number): number[] {
  const pids: number[] = [];
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const seen = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        if (fields[0] !== 'TCP' || !fields[1]?.endsWith(`:${port}`) || fields[3] !== 'LISTENING') continue;
        const m = line.trim().match(/\s+(\d+)\s*$/);
        if (m) {
          const pid = parseInt(m[1], 10);
          if (Number.isFinite(pid) && pid > 0 && !seen.has(pid)) {
            seen.add(pid);
            pids.push(pid);
          }
        }
      }
    } else {
      const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      for (const s of out.split(/\s+/)) {
        const pid = parseInt(s, 10);
        if (Number.isFinite(pid) && pid > 0) pids.push(pid);
      }
    }
  } catch {
    // No process on port or command failed
  }
  return [...new Set(pids)];
}

/** Kill process(es) listening on the given port. */
function killProcessOnPort(port: number): { killed: number; error?: string } {
  const pids = getPidsOnPort(port);
  if (pids.length === 0) return { killed: 0 };
  try {
    if (process.platform === 'win32') {
      for (const pid of pids) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
      }
    } else {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          try {
            process.kill(pid, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        }
      }
    }
    return { killed: pids.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { killed: 0, error: msg };
  }
}

export interface RestartComfyUIOptions {
  /** Wait for ComfyUI to respond on /system_stats before resolving. Default true. */
  waitForReady?: boolean;
  /** Max ms to wait for ready. Default 120000. */
  waitTimeoutMs?: number;
  /** Poll interval for ready check. Default 2000. */
  waitPollMs?: number;
}

export interface RestartComfyUIResult {
  ok: boolean;
  message: string;
  killed?: number;
  started?: boolean;
  ready?: boolean;
}

function localRestartTarget(): ReturnType<typeof getComfyHostPort> {
  const raw = process.env[COMFYUI_HOST_ENV]?.trim() || DEFAULT_COMFYUI_HOST;
  const parsed = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('COMFYUI_HOST must be an HTTP URL.');
  const target = getComfyHostPort();
  const host = target.host.replace(/^\[|\]$/g, '');
  if (!['localhost', '::1', '0.0.0.0'].includes(host) && !/^127\./.test(host)) {
    throw new Error('Local restart requires a localhost COMFYUI_HOST; a remote server cannot be restarted by killing a local port.');
  }
  if (target.baseUrl.startsWith('https:')) throw new Error('Local restart does not configure TLS; use an http localhost COMFYUI_HOST.');
  return { ...target, host: host === 'localhost' || host === '0.0.0.0' ? '127.0.0.1' : host };
}

/**
 * Restart ComfyUI: kill process on COMFYUI_HOST port and start main.py from COMFYUI_PATH.
 * Ensures custom nodes are reloaded. Requires COMFYUI_PATH. Uses COMFYUI_HOST for port.
 */
export function restartComfyUI(options: RestartComfyUIOptions = {}): RestartComfyUIResult {
  const base = getComfyPath();
  if (!base) {
    return {
      ok: false,
      message: 'COMFYUI_PATH is not set. Set it to your ComfyUI installation directory.',
    };
  }
  const mainPy = join(base, 'main.py');
  if (!existsSync(mainPy)) {
    return {
      ok: false,
      message: `main.py not found at ${mainPy}. Check COMFYUI_PATH.`,
    };
  }
  let target: ReturnType<typeof getComfyHostPort>;
  try { target = localRestartTarget(); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const { host, port, baseUrl } = target;

  const killResult = killProcessOnPort(port);
  if (killResult.error && killResult.killed === 0) {
    return { ok: false, message: `Failed to kill process on port ${port}: ${killResult.error}` };
  }

  const python = getPythonExecutable(base);
  const child = spawn(python, ['main.py', '--listen', host, '--port', String(port)], {
    cwd: base,
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => { /* The synchronous API reports missing pid; prevent an unhandled spawn error. */ });
  child.unref();
  if (!child.pid) {
    return {
      ok: false,
      message: `Started ComfyUI but could not detach (pid unknown). Check ${baseUrl} manually.`,
      killed: killResult.killed,
      started: false,
    };
  }

  return {
    ok: true,
    message: `ComfyUI restarted (pid ${child.pid}). Port ${port}. Call sync_nodes_to_knowledge when ready, or use reload_comfyui with wait_for_ready.`,
    killed: killResult.killed,
    started: true,
  };
}

/** Restart ComfyUI asynchronously; returns a Promise that resolves when ready (or timeout). Use this to reload custom nodes. */
export async function restartComfyUIAsync(
  options: RestartComfyUIOptions = {}
): Promise<RestartComfyUIResult> {
  const base = getComfyPath();
  if (!base) {
    return Promise.resolve({
      ok: false,
      message: 'COMFYUI_PATH is not set.',
    });
  }
  const mainPy = join(base, 'main.py');
  if (!existsSync(mainPy)) {
    return Promise.resolve({
      ok: false,
      message: `main.py not found at ${mainPy}.`,
    });
  }
  let target: ReturnType<typeof getComfyHostPort>;
  try { target = localRestartTarget(); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const { host, port, baseUrl } = target;
  const waitForReady = options.waitForReady !== false;
  const waitTimeoutMs = options.waitTimeoutMs ?? 120_000;
  const waitPollMs = options.waitPollMs ?? 2_000;

  const killResult = killProcessOnPort(port);
  if (killResult.error) return { ok: false, message: `Failed to stop ComfyUI: ${killResult.error}`, killed: killResult.killed };
  if (killResult.killed > 0) {
    await new Promise((r) => setTimeout(r, 1500));
  }

  const python = getPythonExecutable(base);
  const child = spawn(python, ['main.py', '--listen', host, '--port', String(port)], {
    cwd: base,
    detached: true,
    stdio: 'ignore',
  });
  let processError: string | undefined;
  child.on('error', (error) => { processError = error.message; });
  child.on('exit', (code, signal) => { processError = `ComfyUI exited before becoming ready (code ${code}, signal ${signal}).`; });
  const spawned = await new Promise<boolean>((resolve) => {
    child.once('spawn', () => resolve(true));
    child.once('error', () => resolve(false));
  });
  child.unref();
  if (!spawned) return { ok: false, message: `Failed to start ComfyUI: ${processError}`, killed: killResult.killed, started: false };

  if (!waitForReady) {
    return {
      ok: true,
      message: `ComfyUI restarted (pid ${child.pid ?? 'unknown'}). Port ${port}.`,
      killed: killResult.killed,
      started: true,
    };
  }

  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    if (processError) return { ok: false, message: processError, killed: killResult.killed, started: true, ready: false };
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/system_stats`, { method: 'GET', signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))) });
      if (response.ok && !processError) return { ok: true, message: 'ComfyUI restarted and ready. Call sync_nodes_to_knowledge to update the knowledge base.', killed: killResult.killed, started: true, ready: true };
    } catch { /* Retry until the bounded deadline. */ }
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(waitPollMs, deadline - Date.now()))));
  }
  return { ok: false, message: processError ?? `ComfyUI started but not ready within ${waitTimeoutMs}ms. Check ${baseUrl}.`, killed: killResult.killed, started: true, ready: false };
}

export function isManagerCliConfigured(): boolean {
  const path = getComfyPath();
  if (!path) return false;
  const cmCliPath = join(path, 'custom_nodes', 'ComfyUI-Manager', 'cm-cli.py');
  return existsSync(cmCliPath);
}

/**
 * Get Python executable, preferring ComfyUI venv if available.
 * Falls back to system python3/python if venv not found.
 */
export function getPythonExecutable(comfyPath?: string): string {
  const configured = process.env.COMFYUI_PYTHON?.trim();
  if (configured) return configured;
  const base = comfyPath ?? getComfyPath();

  if (base) {
    const candidates = ['.venv', 'venv'].flatMap((venv) => process.platform === 'win32'
      ? [join(base, venv, 'Scripts', 'python.exe')]
      : [join(base, venv, 'bin', 'python3'), join(base, venv, 'bin', 'python')]);
    candidates.push(join(base, '..', 'python_embeded', 'python.exe'));
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  }

  // Fallback to system Python
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Run cm-cli.py with given args (e.g. ['install', 'ComfyUI-Blip']).
 * cwd = COMFYUI_PATH. Uses the configured interpreter or the ComfyUI virtual environment.
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
  const python = getPythonExecutable(base);
  const richCheck = checkRichAvailable(base);
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
  // cm-cli otherwise reports individual installation errors with exit status 0.
  const commandArgs = args[0] === 'install' && !args.includes('--exit-on-fail') ? [...args, '--exit-on-fail'] : args;
  const child = spawnSync(python, [cmCliPath, ...commandArgs], {
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
    stderr: (stderr.trim() || child.error?.message) ?? '',
    code: code ?? null,
  };
}

/**
 * Check if the Python used for cm-cli has the 'rich' module (required by ComfyUI-Manager cm-cli).
 * Uses ComfyUI venv Python if available, otherwise falls back to system Python.
 */
export function checkRichAvailable(comfyPath?: string): { available: boolean; message?: string } {
  const python = getPythonExecutable(comfyPath);
  const child = spawnSync(python, ['-c', 'import rich'], {
    encoding: 'utf8',
    timeout: 5000,
    cwd: comfyPath ?? undefined,
  });
  if (child.status === 0) {
    return { available: true };
  }
  const stderr = (child.stderr ?? '') as string;
  const msg = stderr.trim() || "ModuleNotFoundError: No module named 'rich'";
  return {
    available: false,
    message: `ComfyUI-Manager requires the Python package 'rich'. Install it in the ComfyUI environment: ${python} -m pip install rich. Original: ${msg}`,
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
  const child = spawnSync('comfy', ['--skip-prompt', '--workspace', base, 'model', 'download', '--url', url, '--relative-path', relativePath], {
    cwd: base,
    encoding: 'utf8',
    timeout: 600_000,
    shell: false,
  });
  const stdout = (child.stdout ?? '') as string;
  const stderr = (child.stderr ?? '') as string;
  const code = child.status;
  return {
    ok: code === 0,
    stdout: stdout.trim(),
    stderr: (stderr.trim() || child.error?.message) ?? '',
    code: code ?? null,
  };
}

/** Check if comfy-cli is available in PATH. */
export function isComfyCliAvailable(): boolean {
  const child = spawnSync('comfy', ['--help'], { encoding: 'utf8', timeout: 5000, shell: false });
  return child.status === 0;
}

/**
 * Resolve model type to relative path (e.g. 'lora' -> 'models/loras').
 */
export function getRelativePathForModelType(modelType: string): string {
  const key = modelType.toLowerCase().trim();
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('Model type must be a category name without path separators.');
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
  const absoluteDir = resolve(base, destDir);
  const relativeDir = relative(resolve(base), absoluteDir);
  if (relativeDir === '..' || relativeDir.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relativeDir)) return { ok: false, error: 'Model destination must be inside COMFYUI_PATH.' };
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
    if (filename === '.' || filename === '..') filename = 'model.safetensors';
    mkdirSync(absoluteDir, { recursive: true });
    const filePath = join(absoluteDir, filename);
    if (!res.body) throw new Error('Model response has no body.');
    const temporaryPath = `${filePath}.${randomUUID()}.part`;
    try {
      await pipeline(res.body, createWriteStream(temporaryPath, { flags: 'wx' }));
      await rename(temporaryPath, filePath);
    } finally { await rm(temporaryPath, { force: true }); }
    return { ok: true, path: join(destDir, filename) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
