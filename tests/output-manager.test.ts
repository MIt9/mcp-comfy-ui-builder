/**
 * Unit tests for output-manager (mocked getHistory, fetch).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const mockGetHistory = vi.fn();
const mockFetchOutputByFilename = vi.fn();
const mockFetch = vi.fn();
vi.mock('../src/comfyui-client.js', () => ({
  getHistory: (...args: unknown[]) => mockGetHistory(...args),
  fetchOutputByFilename: (...args: unknown[]) => mockFetchOutputByFilename(...args),
}));
vi.mock('node-fetch', () => ({ default: (...args: unknown[]) => mockFetch(...args) }));

describe('listOutputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMFYUI_HOST = 'http://127.0.0.1:8188';
  });

  it('returns empty when no history', async () => {
    mockGetHistory.mockResolvedValue([]);
    const { listOutputs } = await import('../src/output-manager.js');
    const files = await listOutputs('p1', { retryDelayMs: 0 });
    expect(files).toEqual([]);
  });

  it('returns image outputs from history', async () => {
    mockGetHistory.mockResolvedValueOnce([
      {
        prompt_id: 'p1',
        outputs: {
          '7': { images: [{ filename: '00001.png', subfolder: 'output', type: 'output' }] },
        },
      },
    ]);
    const { listOutputs } = await import('../src/output-manager.js');
    const files = await listOutputs('p1', { retryDelayMs: 0 });
    expect(files).toHaveLength(1);
    expect(mockGetHistory).toHaveBeenCalledWith('p1');
    expect(files[0].prompt_id).toBe('p1');
    expect(files[0].node_id).toBe('7');
    expect(files[0].filename).toBe('00001.png');
    expect(files[0].url).toContain('/view?');
    expect(files[0].url).toContain('filename=00001.png');
  });

  it('retries and returns outputs when history appears after delay (timing)', async () => {
    // Attempt 1–2: empty; attempt 3: has entry (retryDelayMs: 0 so no real wait)
    mockGetHistory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          prompt_id: 'p1',
          outputs: {
            '7': { images: [{ filename: 'delayed.png', subfolder: 'output', type: 'output' }] },
          },
        },
      ]);
    const { listOutputs } = await import('../src/output-manager.js');
    const files = await listOutputs('p1', { retryDelayMs: 0 });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('delayed.png');
    expect(mockGetHistory).toHaveBeenCalledTimes(5);
  });

  it('falls back to full history when GET /history/{id} returns empty (fresh prompt)', async () => {
    mockGetHistory
      .mockResolvedValueOnce([]) // GET /history/p1 returns empty
      .mockResolvedValueOnce([
        { prompt_id: 'other', outputs: {} },
        {
          prompt_id: 'p1',
          outputs: {
            '7': { images: [{ filename: 'fresh.png', subfolder: 'output', type: 'output' }] },
          },
        },
      ]);
    const { listOutputs } = await import('../src/output-manager.js');
    const files = await listOutputs('p1', { retryDelayMs: 0 });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('fresh.png');
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
    expect(mockGetHistory).toHaveBeenNthCalledWith(1, 'p1');
    expect(mockGetHistory).toHaveBeenNthCalledWith(2); // no args
  });
});

describe('downloadOutput', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'output-manager-'));
    process.env.COMFYUI_HOST = 'http://127.0.0.1:8188';
  });

  it('writes file to dest path', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from('image-data') });
    const { downloadOutput } = await import('../src/output-manager.js');
    const file = {
      prompt_id: 'p1',
      node_id: '7',
      type: 'image' as const,
      filename: 'out.png',
      subfolder: '',
      url: 'http://127.0.0.1:8188/view?filename=out.png&type=output',
    };
    const destPath = join(tmpDir, 'out.png');
    const path = await downloadOutput(file, destPath);
    expect(path).toBe(destPath);
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf8')).toBe('image-data');
  });
});

describe('downloadByFilename', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'output-manager-'));
    process.env.COMFYUI_HOST = 'http://127.0.0.1:8188';
  });

  it('writes file by filename without prompt_id', async () => {
    const ab = new ArrayBuffer(9);
    new Uint8Array(ab).set(Buffer.from('png-bytes'));
    mockFetchOutputByFilename.mockResolvedValueOnce(ab);
    const { downloadByFilename } = await import('../src/output-manager.js');
    const destPath = join(tmpDir, 'mcp-comfy-preview_00001_.png');
    const result = await downloadByFilename('mcp-comfy-preview_00001_.png', destPath, {
      type: 'output',
    });
    expect(result.path).toBe(destPath);
    expect(result.size).toBe(9);
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, 'utf8')).toBe('png-bytes');
    expect(mockFetchOutputByFilename).toHaveBeenCalledWith('mcp-comfy-preview_00001_.png', {
      type: 'output',
    });
  });

  it('converts to webp when output_format is webp and writes correct file', async () => {
    const pngBuffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#f00' } })
      .png()
      .toBuffer();
    mockFetchOutputByFilename.mockResolvedValueOnce(pngBuffer.buffer);
    const { downloadByFilename } = await import('../src/output-manager.js');
    const destPath = join(tmpDir, 'out.png');
    const result = await downloadByFilename('ComfyUI_00001_.png', destPath, {
      type: 'output',
      output_format: 'webp',
    });
    expect('path' in result).toBe(true);
    if ('path' in result) {
      expect(result.path).toBe(join(tmpDir, 'out.webp'));
      expect(result.size).toBeGreaterThan(0);
      const written = readFileSync(result.path);
      expect(written.slice(0, 4).toString('ascii')).toBe('RIFF');
      expect(written.slice(8, 12).toString('ascii')).toBe('WEBP');
    }
  });

  it('converts to jpeg when output_format is jpeg', async () => {
    const pngBuffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#00f' } })
      .png()
      .toBuffer();
    mockFetchOutputByFilename.mockResolvedValueOnce(pngBuffer.buffer);
    const { downloadByFilename } = await import('../src/output-manager.js');
    const destPath = join(tmpDir, 'result.png');
    const result = await downloadByFilename('out.png', destPath, {
      output_format: 'jpeg',
    });
    expect('path' in result).toBe(true);
    if ('path' in result) {
      expect(result.path).toBe(join(tmpDir, 'result.jpg'));
      const written = readFileSync(result.path);
      expect(written[0]).toBe(0xff);
      expect(written[1]).toBe(0xd8);
    }
  });

  it('returns base64 with output_format webp (mime and filename)', async () => {
    const pngBuffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#0f0' } })
      .png()
      .toBuffer();
    mockFetchOutputByFilename.mockResolvedValueOnce(pngBuffer.buffer);
    const { downloadByFilename } = await import('../src/output-manager.js');
    const result = await downloadByFilename('x.png', join(tmpDir, 'x.png'), {
      returnBase64: true,
      output_format: 'webp',
    });
    expect('encoding' in result).toBe(true);
    if ('encoding' in result && result.encoding === 'base64') {
      expect(result.filename).toMatch(/\.webp$/);
      expect(result.mime).toBe('image/webp');
      expect(result.converted).toBe(true);
      expect(result.original_size).toBe(pngBuffer.length);
      expect(Buffer.from(result.data, 'base64').slice(0, 4).toString('ascii')).toBe('RIFF');
    }
  });

  it('appends extension when dest_path has no image extension and output_format is set', async () => {
    const pngBuffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    mockFetchOutputByFilename.mockResolvedValueOnce(pngBuffer.buffer);
    const { downloadByFilename } = await import('../src/output-manager.js');
    const destPath = join(tmpDir, 'noext');
    const result = await downloadByFilename('a.png', destPath, { output_format: 'webp' });
    expect('path' in result).toBe(true);
    if ('path' in result) expect(result.path).toBe(join(tmpDir, 'noext.webp'));
  });
});

describe('downloadAllOutputs path containment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMFYUI_HOST = 'http://127.0.0.1:8188';
  });

  it.each([
    { filename: '../outside.png', nodeId: '7', prefix: false },
    { filename: '../../outside.png', nodeId: '7', prefix: true },
    { filename: '..\\outside.png', nodeId: '7', prefix: false },
    { filename: '/tmp/outside.png', nodeId: '7', prefix: false },
    { filename: 'C:\\outside.png', nodeId: '7', prefix: false },
    { filename: 'safe.png', nodeId: '../..', prefix: true },
  ])('rejects untrusted output path $filename / $nodeId before downloading', async ({ filename, nodeId, prefix }) => {
    const parent = mkdtempSync(join(tmpdir(), 'output-containment-'));
    const outside = join(parent, 'outside.png');
    writeFileSync(outside, 'original');
    mockGetHistory.mockResolvedValue([{ prompt_id: 'p1', outputs: {
      '1': { images: [{ filename: 'safe-first.png', subfolder: '', type: 'output' }] },
      [nodeId]: { images: [{ filename, subfolder: '', type: 'output' }] },
    } }]);
    try {
      const { downloadAllOutputs } = await import('../src/output-manager.js');
      await expect(downloadAllOutputs('p1', join(parent, 'downloads'), { prefixNodeId: prefix })).rejects.toThrow('plain path segments');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(readFileSync(outside, 'utf8')).toBe('original');
      expect(existsSync(join(parent, 'downloads'))).toBe(false);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

  it('downloads plain filenames inside the selected directory', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'output-containment-'));
    mockGetHistory.mockResolvedValue([{ prompt_id: 'p1', outputs: { '7': { images: [{ filename: 'image.png', subfolder: 'remote-subfolder', type: 'output' }] } } }]);
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('image') });
    try {
      const { downloadAllOutputs } = await import('../src/output-manager.js');
      const paths = await downloadAllOutputs('p1', parent);
      expect(paths).toEqual([join(parent, '7_image.png')]);
      expect(readFileSync(paths[0], 'utf8')).toBe('image');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});
