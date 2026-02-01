/**
 * Unit tests for workflow storage: saveWorkflow, listSavedWorkflows, loadWorkflow.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveWorkflow, listSavedWorkflows, loadWorkflow } from '../src/workflow/workflow-storage.js';
import type { ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

const sampleWorkflow: ComfyUIWorkflow = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a cat', clip: ['1', 1] } },
};

describe('workflow-storage', () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'workflow-storage-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveWorkflow creates workflows dir and file', async () => {
    const path = await saveWorkflow('my_workflow', sampleWorkflow);
    expect(path).toContain('workflows');
    expect(path).toContain('my_workflow.json');
    const list = await listSavedWorkflows();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('my_workflow');
    expect(list[0].path).toBe(path);
  });

  it('loadWorkflow returns saved workflow by name', async () => {
    await saveWorkflow('loaded', sampleWorkflow);
    const loaded = await loadWorkflow('loaded');
    expect(loaded).toEqual(sampleWorkflow);
  });

  it('loadWorkflow by path when name contains path sep', async () => {
    const path = await saveWorkflow('by_path', sampleWorkflow);
    const loaded = await loadWorkflow(path);
    expect(loaded).toEqual(sampleWorkflow);
  });

  it('sanitizeName strips invalid chars', async () => {
    await saveWorkflow('hello world', sampleWorkflow);
    const list = await listSavedWorkflows();
    expect(list[0].name).toMatch(/hello_world|workflow/);
    const loaded = await loadWorkflow('hello world');
    expect(loaded).toEqual(sampleWorkflow);
  });

  it('listSavedWorkflows returns empty when no workflows dir', async () => {
    const list = await listSavedWorkflows();
    expect(list).toEqual([]);
  });

  it('loadWorkflow throws for missing file', async () => {
    await expect(loadWorkflow('nonexistent')).rejects.toThrow();
  });
});
