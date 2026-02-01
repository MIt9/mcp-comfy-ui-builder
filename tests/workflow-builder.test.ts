/**
 * Unit tests for workflow builder: buildFromTemplate, txt2img.
 */
import { describe, it, expect } from 'vitest';
import { buildFromTemplate, listTemplates } from '../src/workflow/workflow-builder.js';
import type { ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

describe('workflow-builder', () => {
  it('listTemplates includes txt2img', () => {
    const list = listTemplates();
    expect(list).toContain('txt2img');
  });

  it('buildFromTemplate("txt2img") returns valid workflow with default params', () => {
    const workflow = buildFromTemplate('txt2img');
    expect(workflow).toBeDefined();
    expect(Object.keys(workflow).length).toBe(7);
    expect(workflow['1']).toEqual({
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' },
    });
    expect(workflow['5'].class_type).toBe('KSampler');
    expect(workflow['5'].inputs).toMatchObject({
      steps: 20,
      cfg: 8,
      denoise: 1,
      seed: 0,
    });
    expect(workflow['7'].class_type).toBe('SaveImage');
  });

  it('buildFromTemplate("txt2img", params) fills width, height, prompt', () => {
    const workflow = buildFromTemplate('txt2img', {
      width: 512,
      height: 768,
      prompt: 'a cat',
      negative_prompt: 'blur',
      steps: 30,
      seed: 42,
    }) as ComfyUIWorkflow;
    expect(workflow['4'].inputs).toMatchObject({ width: 512, height: 768 });
    expect(workflow['2'].inputs).toMatchObject({ text: 'a cat' });
    expect(workflow['3'].inputs).toMatchObject({ text: 'blur' });
    expect(workflow['5'].inputs).toMatchObject({ steps: 30, seed: 42 });
  });

  it('buildFromTemplate("txt2img") has valid references [nodeId, outputIndex]', () => {
    const workflow = buildFromTemplate('txt2img');
    expect(workflow['2'].inputs.clip).toEqual(['1', 1]);
    expect(workflow['5'].inputs.model).toEqual(['1', 0]);
    expect(workflow['5'].inputs.positive).toEqual(['2', 0]);
    expect(workflow['5'].inputs.negative).toEqual(['3', 0]);
    expect(workflow['5'].inputs.latent_image).toEqual(['4', 0]);
    expect(workflow['6'].inputs.samples).toEqual(['5', 0]);
    expect(workflow['6'].inputs.vae).toEqual(['1', 2]);
    expect(workflow['7'].inputs.images).toEqual(['6', 0]);
  });

  it('buildFromTemplate throws for unknown template', () => {
    expect(() => buildFromTemplate('unknown')).toThrow(/Unknown template/);
  });

  it('listTemplates includes img2img', () => {
    const list = listTemplates();
    expect(list).toContain('img2img');
  });

  it('buildFromTemplate("img2img") returns valid workflow with default params', () => {
    const workflow = buildFromTemplate('img2img');
    expect(workflow).toBeDefined();
    expect(Object.keys(workflow).length).toBe(8);
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].class_type).toBe('LoadImage');
    expect(workflow['3'].class_type).toBe('VAEEncode');
    expect(workflow['6'].class_type).toBe('KSampler');
    expect(workflow['6'].inputs).toMatchObject({
      steps: 20,
      cfg: 8,
      denoise: 0.75,
    });
    expect(workflow['8'].class_type).toBe('SaveImage');
  });

  it('buildFromTemplate("img2img", params) fills image, prompt, denoise', () => {
    const workflow = buildFromTemplate('img2img', {
      image: 'test.png',
      prompt: 'enhance this',
      negative_prompt: 'bad quality',
      denoise: 0.5,
      seed: 123,
    });
    expect(workflow['2'].inputs).toMatchObject({ image: 'test.png' });
    expect(workflow['4'].inputs).toMatchObject({ text: 'enhance this' });
    expect(workflow['5'].inputs).toMatchObject({ text: 'bad quality' });
    expect(workflow['6'].inputs).toMatchObject({ denoise: 0.5, seed: 123 });
  });

  it('buildFromTemplate("img2img") has valid references [nodeId, outputIndex]', () => {
    const workflow = buildFromTemplate('img2img');
    expect(workflow['3'].inputs.pixels).toEqual(['2', 0]);
    expect(workflow['3'].inputs.vae).toEqual(['1', 2]);
    expect(workflow['6'].inputs.model).toEqual(['1', 0]);
    expect(workflow['6'].inputs.positive).toEqual(['4', 0]);
    expect(workflow['6'].inputs.negative).toEqual(['5', 0]);
    expect(workflow['6'].inputs.latent_image).toEqual(['3', 0]);
    expect(workflow['7'].inputs.samples).toEqual(['6', 0]);
    expect(workflow['8'].inputs.images).toEqual(['7', 0]);
  });
});
