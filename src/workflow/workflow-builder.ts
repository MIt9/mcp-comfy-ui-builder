/**
 * Build ComfyUI workflow JSON from template (e.g. txt2img).
 * Node class_type and input names follow knowledge base (base-nodes.json).
 */
import type { ComfyUIWorkflow, ComfyUINodeDef } from '../types/comfyui-api-types.js';

export type Txt2ImgParams = {
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
  batch_size?: number;
  denoise?: number;
};

export type Img2ImgParams = {
  image?: string;
  steps?: number;
  cfg?: number;
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
  denoise?: number;
};

const DEFAULT_TXT2IMG = {
  width: 1024,
  height: 1024,
  steps: 20,
  cfg: 8,
  prompt: '',
  negative_prompt: '',
  seed: 0,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI',
  batch_size: 1,
  denoise: 1,
};

const DEFAULT_IMG2IMG = {
  image: 'input.png',
  steps: 20,
  cfg: 8,
  prompt: '',
  negative_prompt: '',
  seed: 0,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI_img2img',
  denoise: 0.75,
};

/**
 * Build img2img workflow: LoadImage → VAEEncode → CheckpointLoaderSimple → CLIPTextEncode (pos/neg) → KSampler → VAEDecode → SaveImage.
 */
function buildImg2Img(params: Img2ImgParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_IMG2IMG, ...params };
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.ckpt_name },
    },
    '2': {
      class_type: 'LoadImage',
      inputs: { image: p.image },
    },
    '3': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['2', 0], vae: ['1', 2] },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['1', 1] },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negative_prompt, clip: ['1', 1] },
    },
    '6': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['3', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        denoise: p.denoise,
      },
    },
    '7': {
      class_type: 'VAEDecode',
      inputs: { samples: ['6', 0], vae: ['1', 2] },
    },
    '8': {
      class_type: 'SaveImage',
      inputs: { images: ['7', 0], filename_prefix: p.filename_prefix },
    },
  };
  return nodes;
}

/**
 * Build txt2img workflow: CheckpointLoaderSimple → CLIPTextEncode (pos/neg) → EmptyLatentImage → KSampler → VAEDecode → SaveImage.
 */
function buildTxt2Img(params: Txt2ImgParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_TXT2IMG, ...params };
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.ckpt_name },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negative_prompt, clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.width, height: p.height, batch_size: p.batch_size },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        denoise: p.denoise,
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: p.filename_prefix },
    },
  };
  return nodes;
}

const TEMPLATES: Record<string, (params: Record<string, unknown>) => ComfyUIWorkflow> = {
  txt2img: (params) => buildTxt2Img(params as Txt2ImgParams),
  img2img: (params) => buildImg2Img(params as Img2ImgParams),
};

/**
 * Build ComfyUI workflow JSON from a template and parameters.
 * Returns ComfyUI-ready object (node id → { class_type, inputs }).
 */
export function buildFromTemplate(
  templateId: string,
  params?: Record<string, unknown>
): ComfyUIWorkflow {
  const fn = TEMPLATES[templateId];
  if (!fn) {
    throw new Error(`Unknown template: ${templateId}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
  }
  return fn(params ?? {});
}

/**
 * List available template IDs.
 */
export function listTemplates(): string[] {
  return Object.keys(TEMPLATES);
}
