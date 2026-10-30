import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Response } from 'node-fetch';
import { getPythonExecutable, getComfyHostPort, restartComfyUI, restartComfyUIAsync, runCmCli, runComfyModelDownload, getRelativePathForModelType, downloadModelToDir } from '../src/manager-cli.js';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn(), fetch: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, spawnSync: mocks.spawnSync, execSync: mocks.execSync }));
vi.mock('node-fetch', async (original) => ({ ...await original<typeof import('node-fetch')>(), default: mocks.fetch }));

let base: string;
function mockChild(event: 'spawn' | 'error' = 'spawn') {
  const child = Object.assign(new EventEmitter(), { pid: event === 'spawn' ? 12345 : undefined, unref: vi.fn() });
  mocks.spawn.mockImplementation(() => { queueMicrotask(() => event === 'spawn' ? child.emit('spawn') : child.emit('error', new Error('ENOENT'))); return child; });
  return child;
}

beforeEach(() => {
  vi.resetAllMocks();
  base = mkdtempSync(join(tmpdir(), 'comfy-manager-test-'));
  writeFileSync(join(base, 'main.py'), '');
  vi.stubEnv('COMFYUI_PATH', base);
  vi.stubEnv('COMFYUI_HOST', 'http://127.0.0.1:8188');
  vi.stubEnv('COMFYUI_PYTHON', '');
  mocks.execSync.mockImplementation(() => { throw new Error('No listener'); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(base, { recursive: true, force: true }); });

describe('ComfyUI interpreter and installation commands', () => {
  it('uses .venv Python and honors an explicit interpreter', () => {
    const python = join(base, '.venv', 'bin', 'python');
    mkdirSync(join(base, '.venv', 'bin'), { recursive: true });
    writeFileSync(python, '');
    expect(getPythonExecutable()).toBe(python);
    vi.stubEnv('COMFYUI_PYTHON', '/custom/python');
    expect(getPythonExecutable()).toBe('/custom/python');
  });

  it('runs cm-cli inside the ComfyUI environment and reports spawn errors', () => {
    mkdirSync(join(base, 'custom_nodes', 'ComfyUI-Manager'), { recursive: true });
    const script = join(base, 'custom_nodes', 'ComfyUI-Manager', 'cm-cli.py');
    writeFileSync(script, '');
    vi.stubEnv('COMFYUI_PYTHON', '/custom/python');
    mocks.spawnSync.mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: null, error: new Error('spawn failed') });
    const result = runCmCli(['install', 'test-pack']);
    expect(mocks.spawnSync).toHaveBeenLastCalledWith('/custom/python', [script, 'install', 'test-pack', '--exit-on-fail'], expect.objectContaining({ cwd: base }));
    expect(result).toMatchObject({ ok: false, stderr: 'spawn failed' });
  });

  it('pins comfy-cli model downloads to the configured workspace without a shell', () => {
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    expect(runComfyModelDownload('https://example.com/model.safetensors', 'models/vae').ok).toBe(true);
    expect(mocks.spawnSync).toHaveBeenCalledWith('comfy', ['--skip-prompt', '--workspace', base, 'model', 'download', '--url', 'https://example.com/model.safetensors', '--relative-path', 'models/vae'], expect.objectContaining({ shell: false }));
    expect(getRelativePathForModelType('embeddings')).toBe('models/embeddings');
    expect(getRelativePathForModelType('embedding')).toBe('models/embeddings');
    expect(() => getRelativePathForModelType('../../outside')).toThrow();
  });
});

describe('ComfyUI restart', () => {
  it('uses a consistent default port and binds explicitly to loopback', async () => {
    vi.stubEnv('COMFYUI_HOST', 'http://localhost');
    expect(getComfyHostPort()).toMatchObject({ port: 8188, baseUrl: 'http://localhost:8188' });
    mockChild();
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await restartComfyUIAsync({ waitTimeoutMs: 100 })).toMatchObject({ ok: true, ready: true });
    expect(mocks.spawn).toHaveBeenCalledWith(expect.any(String), ['main.py', '--listen', '127.0.0.1', '--port', '8188'], expect.objectContaining({ cwd: base }));
    expect(mocks.execSync).toHaveBeenCalledWith('lsof -nP -iTCP:8188 -sTCP:LISTEN -t', expect.any(Object));
  });

  it('does not kill local processes for a remote host', async () => {
    vi.stubEnv('COMFYUI_HOST', 'http://example.com:8188');
    expect(await restartComfyUIAsync()).toMatchObject({ ok: false });
    expect(restartComfyUI()).toMatchObject({ ok: false });
    expect(mocks.execSync).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('does not fall back to a local restart for a malformed host URL', async () => {
    vi.stubEnv('COMFYUI_HOST', 'http://[');
    expect(await restartComfyUIAsync()).toMatchObject({ ok: false });
    expect(mocks.execSync).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('reports spawn failure even without waiting for readiness', async () => {
    mockChild('error');
    expect(await restartComfyUIAsync({ waitForReady: false })).toMatchObject({ ok: false, started: false });
  });

  it('reports early process exit and readiness timeout as failures', async () => {
    const child = mockChild();
    mocks.fetch.mockImplementation(async () => { child.emit('exit', 1, null); return new Response('', { status: 503 }); });
    expect(await restartComfyUIAsync({ waitTimeoutMs: 100, waitPollMs: 1 })).toMatchObject({ ok: false, started: true, ready: false });
    mockChild();
    mocks.fetch.mockResolvedValue(new Response('', { status: 503 }));
    expect(await restartComfyUIAsync({ waitTimeoutMs: 5, waitPollMs: 1 })).toMatchObject({ ok: false, ready: false });
  });
});

describe('direct model downloads', () => {
  it('streams into a temporary file and commits the complete model', async () => {
    mocks.fetch.mockResolvedValue(new Response(Readable.from(['model', '-bytes']), { headers: { 'content-disposition': 'attachment; filename="weights.safetensors"' } }));
    expect(await downloadModelToDir('https://example.com/download', 'models/vae')).toEqual({ ok: true, path: join('models/vae', 'weights.safetensors') });
    expect(readFileSync(join(base, 'models/vae/weights.safetensors'), 'utf8')).toBe('model-bytes');
    expect(readdirSync(join(base, 'models/vae'))).toEqual(['weights.safetensors']);
  });

  it('cleans failed streams without replacing an existing model', async () => {
    mkdirSync(join(base, 'models/vae'), { recursive: true });
    writeFileSync(join(base, 'models/vae/model.safetensors'), 'original');
    const body = Readable.from((async function* () { yield 'partial'; throw new Error('connection lost'); })());
    mocks.fetch.mockResolvedValue(new Response(body));
    expect(await downloadModelToDir('https://example.com/model.safetensors', 'models/vae')).toMatchObject({ ok: false });
    expect(readFileSync(join(base, 'models/vae/model.safetensors'), 'utf8')).toBe('original');
    expect(readdirSync(join(base, 'models/vae'))).toEqual(['model.safetensors']);
  });

  it('rejects destinations outside ComfyUI before network access', async () => {
    expect(await downloadModelToDir('https://example.com/model', '../outside')).toMatchObject({ ok: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
