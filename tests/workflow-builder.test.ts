/**
 * Unit tests for workflow builder: buildFromTemplate, txt2img, inpainting, upscale, lora, controlnet, batch.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFromTemplate,
  listTemplates,
  buildBatch,
} from '../src/workflow/workflow-builder.js';
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
      sampler_name: 'euler',
      scheduler: 'normal',
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

  it('listTemplates includes image_caption', () => {
    const list = listTemplates();
    expect(list).toContain('image_caption');
  });

  it('buildFromTemplate("image_caption") returns LoadImage + BLIPCaption with default image', () => {
    const workflow = buildFromTemplate('image_caption');
    expect(workflow).toBeDefined();
    expect(Object.keys(workflow).length).toBe(2);
    expect(workflow['1'].class_type).toBe('LoadImage');
    expect(workflow['1'].inputs).toMatchObject({ image: 'input.png' });
    expect(workflow['2'].class_type).toBe('BLIPCaption');
    expect(workflow['2'].inputs).toMatchObject({ image: ['1', 0] });
  });

  it('buildFromTemplate("image_caption", { image }) uses given filename', () => {
    const workflow = buildFromTemplate('image_caption', { image: 'ComfyUI_00001.png' });
    expect(workflow['1'].inputs).toMatchObject({ image: 'ComfyUI_00001.png' });
  });

  it('listTemplates includes inpainting, upscale, txt2img_lora, controlnet, batch', () => {
    const list = listTemplates();
    expect(list).toContain('inpainting');
    expect(list).toContain('upscale');
    expect(list).toContain('txt2img_lora');
    expect(list).toContain('controlnet');
    expect(list).toContain('batch');
  });

  it('buildFromTemplate("inpainting") returns workflow with LoadImage, LoadImageMask, SetLatentNoiseMask', () => {
    const workflow = buildFromTemplate('inpainting', {
      image: 'input.png',
      mask: 'mask.png',
      prompt: 'fix this',
      denoise: 0.85,
    }) as ComfyUIWorkflow;
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].class_type).toBe('LoadImage');
    expect(workflow['2'].inputs).toMatchObject({ image: 'input.png' });
    expect(workflow['3'].class_type).toBe('LoadImageMask');
    expect(workflow['3'].inputs).toMatchObject({ image: 'mask.png' });
    expect(workflow['5'].class_type).toBe('SetLatentNoiseMask');
    expect(workflow['5'].inputs).toMatchObject({ samples: ['4', 0], mask: ['3', 0] });
    expect(workflow['8'].class_type).toBe('KSampler');
    expect(workflow['8'].inputs).toMatchObject({ denoise: 0.85 });
    expect(workflow['10'].class_type).toBe('SaveImage');
  });

  it('buildFromTemplate("upscale") returns LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage', () => {
    const workflow = buildFromTemplate('upscale', {
      image: 'lowres.png',
      upscale_model: 'RealESRGAN_x4plus.pth',
    }) as ComfyUIWorkflow;
    expect(workflow['1'].class_type).toBe('LoadImage');
    expect(workflow['2'].class_type).toBe('UpscaleModelLoader');
    expect(workflow['2'].inputs).toMatchObject({ model_name: 'RealESRGAN_x4plus.pth' });
    expect(workflow['3'].class_type).toBe('ImageUpscaleWithModel');
    expect(workflow['3'].inputs).toMatchObject({ upscale_model: ['2', 0], image: ['1', 0] });
    expect(workflow['4'].class_type).toBe('SaveImage');
    expect(Object.keys(workflow).length).toBe(4);
  });

  it('buildFromTemplate("upscale", { refine: true }) adds checkpoint, VAEEncode, KSampler, VAEDecode', () => {
    const workflow = buildFromTemplate('upscale', {
      image: 'lowres.png',
      refine: true,
      denoise: 0.3,
      prompt: 'detailed',
    }) as ComfyUIWorkflow;
    expect(workflow['5'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['8'].class_type).toBe('VAEEncode');
    expect(workflow['9'].class_type).toBe('KSampler');
    expect(workflow['9'].inputs).toMatchObject({ denoise: 0.3 });
    expect(workflow['10'].class_type).toBe('VAEDecode');
    expect(workflow['4'].inputs.images).toEqual(['10', 0]);
  });

  it('buildFromTemplate("txt2img_lora") returns workflow with LoraLoader chain', () => {
    const workflow = buildFromTemplate('txt2img_lora', {
      prompt: 'a landscape',
      loras: [
        { name: 'detail.safetensors', strength_model: 0.8, strength_clip: 0.8 },
      ],
      width: 512,
      height: 512,
    }) as ComfyUIWorkflow;
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].class_type).toBe('LoraLoader');
    expect(workflow['2'].inputs).toMatchObject({
      lora_name: 'detail.safetensors',
      strength_model: 0.8,
      strength_clip: 0.8,
      model: ['1', 0],
      clip: ['1', 1],
    });
    expect(workflow['3'].class_type).toBe('CLIPTextEncode');
    expect(workflow['6'].class_type).toBe('KSampler');
    expect(workflow['8'].class_type).toBe('SaveImage');
  });

  it('buildFromTemplate("txt2img_lora") with multiple loras chains loaders', () => {
    const workflow = buildFromTemplate('txt2img_lora', {
      prompt: 'test',
      loras: [
        { name: 'lora1.safetensors', strength_model: 0.7, strength_clip: 0.7 },
        { name: 'lora2.safetensors', strength_model: 0.5, strength_clip: 0.5 },
      ],
    }) as ComfyUIWorkflow;
    expect(workflow['2'].class_type).toBe('LoraLoader');
    expect(workflow['2'].inputs.model).toEqual(['1', 0]);
    expect(workflow['3'].class_type).toBe('LoraLoader');
    expect(workflow['3'].inputs.model).toEqual(['2', 0]);
    expect(workflow['3'].inputs.lora_name).toBe('lora2.safetensors');
  });

  it('buildFromTemplate("controlnet") returns LoadImage, ControlNetLoader, ApplyControlNet, KSampler', () => {
    const workflow = buildFromTemplate('controlnet', {
      control_image: 'canny.png',
      controlnet_name: 'control_v11p_sd15_canny.pth',
      strength: 0.9,
      prompt: 'a cat',
      width: 512,
      height: 768,
    }) as ComfyUIWorkflow;
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].class_type).toBe('LoadImage');
    expect(workflow['2'].inputs).toMatchObject({ image: 'canny.png' });
    expect(workflow['3'].class_type).toBe('ControlNetLoader');
    expect(workflow['3'].inputs).toMatchObject({ control_net_name: 'control_v11p_sd15_canny.pth' });
    expect(workflow['6'].class_type).toBe('ApplyControlNet');
    expect(workflow['6'].inputs).toMatchObject({
      positive: ['4', 0],
      negative: ['5', 0],
      control_net: ['3', 0],
      image: ['2', 0],
      strength: 0.9,
    });
    expect(workflow['8'].class_type).toBe('KSampler');
    expect(workflow['8'].inputs.positive).toEqual(['6', 0]);
    expect(workflow['8'].inputs.negative).toEqual(['6', 1]);
    expect(workflow['7'].inputs).toMatchObject({ width: 512, height: 768 });
  });

  it('buildFromTemplate("batch") returns first variation workflow', () => {
    const workflow = buildFromTemplate('batch', {
      base_params: { width: 512, height: 512, prompt: 'base' },
      variations: [{ seed: 1, prompt: 'v1' }, { seed: 2 }],
    }) as ComfyUIWorkflow;
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].inputs).toMatchObject({ text: 'v1' });
    expect(workflow['5'].inputs).toMatchObject({ seed: 1 });
  });

  it('buildBatch returns array of workflows per variation', () => {
    const workflows = buildBatch({
      base_params: { width: 256, height: 256, prompt: 'x' },
      variations: [
        { seed: 10 },
        { seed: 20, prompt: 'y' },
      ],
    });
    expect(workflows.length).toBe(2);
    expect(workflows[0]['5'].inputs).toMatchObject({ seed: 10 });
    expect(workflows[0]['2'].inputs).toMatchObject({ text: 'x' });
    expect(workflows[1]['5'].inputs).toMatchObject({ seed: 20 });
    expect(workflows[1]['2'].inputs).toMatchObject({ text: 'y' });
  });
});
