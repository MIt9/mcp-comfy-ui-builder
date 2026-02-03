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

/** Params for image_caption template (requires custom node e.g. ComfyUI-Blip or comfyui-art-venture). */
export type ImageCaptionParams = {
  image?: string;
};

export type InpaintingParams = {
  image?: string;
  mask?: string;
  prompt?: string;
  negative_prompt?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  denoise?: number;
  ckpt_name?: string;
  filename_prefix?: string;
};

export type UpscaleParams = {
  image?: string;
  upscale_model?: string;
  scale?: number;
  refine?: boolean;
  denoise?: number;
  prompt?: string;
  negative_prompt?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
};

export type LoraItem = { name: string; strength_model?: number; strength_clip?: number };
export type Txt2ImgLoraParams = {
  prompt?: string;
  negative_prompt?: string;
  loras?: LoraItem[];
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
  batch_size?: number;
};

export type ControlNetParams = {
  control_image?: string;
  controlnet_name?: string;
  strength?: number;
  prompt?: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
};

/** Params for txt2img_flux template. FLUX uses dual CLIP (clip_l + t5xxl) and cfg=1. Call get_system_resources first; use only when flux_ready is true. */
export type Txt2ImgFluxParams = {
  width?: number;
  height?: number;
  steps?: number;
  /** Short keywords for CLIP-L (style, quality). */
  clip_l?: string;
  /** Long description for T5-XXL (scene, details). */
  t5xxl?: string;
  /** Combined prompt: used for both clip_l and t5xxl when clip_l/t5xxl not set. */
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  ckpt_name?: string;
  filename_prefix?: string;
  batch_size?: number;
  /** Guidance scale (CLIPTextEncodeFlux). FLUX typically 3–4. */
  guidance?: number;
};

export type BatchVariation = { seed?: number; prompt?: string };
export type BatchParams = {
  base_params?: Txt2ImgParams;
  variations?: BatchVariation[];
  batch_size?: number;
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

/** FLUX: use FP8 checkpoint (e.g. flux1-dev-fp8.safetensors) or full UNet + DualCLIPLoader. CFG must be 1. */
const DEFAULT_TXT2IMG_FLUX = {
  width: 1024,
  height: 1024,
  steps: 28,
  clip_l: '',
  t5xxl: '',
  prompt: '',
  negative_prompt: '',
  seed: 0,
  ckpt_name: 'flux1-dev-fp8.safetensors',
  filename_prefix: 'ComfyUI_flux',
  batch_size: 1,
  guidance: 3.5,
};

/** Default KSampler inputs required by ComfyUI (sampler_name, scheduler). */
const DEFAULT_KSAMPLER = { sampler_name: 'euler' as const, scheduler: 'normal' as const };

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

const DEFAULT_INPAINTING = {
  image: 'input.png',
  mask: 'mask.png',
  prompt: '',
  negative_prompt: '',
  steps: 20,
  cfg: 7,
  seed: 0,
  denoise: 0.85,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI_inpaint',
};

const DEFAULT_UPSCALE = {
  image: 'input.png',
  upscale_model: 'RealESRGAN_x4plus.pth',
  scale: 4,
  refine: false,
  denoise: 0.3,
  prompt: '',
  negative_prompt: '',
  steps: 20,
  cfg: 7,
  seed: 0,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI_upscale',
};

const DEFAULT_TXT2IMG_LORA = {
  prompt: '',
  negative_prompt: '',
  loras: [] as LoraItem[],
  width: 1024,
  height: 1024,
  steps: 20,
  cfg: 7,
  seed: 0,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI_lora',
  batch_size: 1,
};

const DEFAULT_CONTROLNET = {
  control_image: 'control.png',
  controlnet_name: 'control_v11p_sd15_canny.pth',
  strength: 1,
  prompt: '',
  negative_prompt: '',
  width: 1024,
  height: 1024,
  steps: 20,
  cfg: 7,
  seed: 0,
  ckpt_name: 'sd_xl_base_1.0.safetensors',
  filename_prefix: 'ComfyUI_controlnet',
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
        ...DEFAULT_KSAMPLER,
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
 * Build inpainting workflow: LoadImage + LoadImageMask → VAEEncode + SetLatentNoiseMask → CheckpointLoaderSimple → CLIPTextEncode → KSampler → VAEDecode → SaveImage.
 */
function buildInpainting(params: InpaintingParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_INPAINTING, ...params };
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
      class_type: 'LoadImageMask',
      inputs: { image: p.mask, channel: 'alpha' },
    },
    '4': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['2', 0], vae: ['1', 2] },
    },
    '5': {
      class_type: 'SetLatentNoiseMask',
      inputs: { samples: ['4', 0], mask: ['3', 0] },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['1', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negative_prompt, clip: ['1', 1] },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        denoise: p.denoise,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['1', 2] },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: p.filename_prefix },
    },
  };
  return nodes;
}

/**
 * Build FLUX txt2img: CheckpointLoaderSimple → CLIPTextEncodeFlux (pos/neg) → ModelSamplingFlux → EmptyLatentImage → KSampler (cfg=1) → VAEDecode → SaveImage.
 * Requires flux_ready from get_system_resources (e.g. 12GB+ VRAM). Use ckpt_name like flux1-dev-fp8.safetensors or flux1-schnell-fp8.safetensors.
 */
function buildTxt2ImgFlux(params: Txt2ImgFluxParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_TXT2IMG_FLUX, ...params };
  const posClipL = p.clip_l !== undefined && p.clip_l !== '' ? p.clip_l : p.prompt ?? '';
  const posT5xxl = p.t5xxl !== undefined && p.t5xxl !== '' ? p.t5xxl : p.prompt ?? '';
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.ckpt_name },
    },
    '2': {
      class_type: 'CLIPTextEncodeFlux',
      inputs: {
        clip: ['1', 1],
        clip_l: posClipL,
        t5xxl: posT5xxl,
        guidance: p.guidance ?? 3.5,
      },
    },
    '3': {
      class_type: 'CLIPTextEncodeFlux',
      inputs: {
        clip: ['1', 1],
        clip_l: p.negative_prompt ?? '',
        t5xxl: p.negative_prompt ?? '',
        guidance: 0,
      },
    },
    '4': {
      class_type: 'ModelSamplingFlux',
      inputs: { model: ['1', 0], width: p.width, height: p.height },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.width, height: p.height, batch_size: p.batch_size },
    },
    '6': {
      class_type: 'KSampler',
      inputs: {
        ...DEFAULT_KSAMPLER,
        model: ['4', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['5', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: 1,
        denoise: 1,
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
        ...DEFAULT_KSAMPLER,
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

/**
 * Build upscale workflow: LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage.
 * Optionally with refinement: upscaled image → VAEEncode → KSampler (denoise) → VAEDecode → SaveImage.
 */
function buildUpscale(params: UpscaleParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_UPSCALE, ...params };
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: p.image },
    },
    '2': {
      class_type: 'UpscaleModelLoader',
      inputs: { model_name: p.upscale_model },
    },
    '3': {
      class_type: 'ImageUpscaleWithModel',
      inputs: { upscale_model: ['2', 0], image: ['1', 0] },
    },
    '4': {
      class_type: 'SaveImage',
      inputs: {
        images: p.refine ? (['10', 0] as [string, number]) : ['3', 0],
        filename_prefix: p.filename_prefix,
      },
    },
  };
  if (p.refine) {
    nodes['5'] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.ckpt_name },
    };
    nodes['6'] = {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['5', 1] },
    };
    nodes['7'] = {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negative_prompt, clip: ['5', 1] },
    };
    nodes['8'] = {
      class_type: 'VAEEncode',
      inputs: { pixels: ['3', 0], vae: ['5', 2] },
    };
    nodes['9'] = {
      class_type: 'KSampler',
      inputs: {
        ...DEFAULT_KSAMPLER,
        model: ['5', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['8', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        denoise: p.denoise,
      },
    };
    nodes['10'] = {
      class_type: 'VAEDecode',
      inputs: { samples: ['9', 0], vae: ['5', 2] },
    };
  }
  return nodes;
}

/**
 * Build txt2img with LoRA(s): CheckpointLoaderSimple → LoraLoader chain → CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage.
 */
function buildTxt2ImgLora(params: Txt2ImgLoraParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_TXT2IMG_LORA, ...params };
  const loras = p.loras && p.loras.length > 0 ? p.loras : [{ name: 'lora.safetensors', strength_model: 0.8, strength_clip: 0.8 }];
  const nodes: Record<string, ComfyUINodeDef> = {};
  let lastModel: [string, number] = ['1', 0];
  let lastClip: [string, number] = ['1', 1];
  nodes['1'] = {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: p.ckpt_name },
  };
  loras.forEach((lora, i) => {
    const nodeId = String(2 + i);
    nodes[nodeId] = {
      class_type: 'LoraLoader',
      inputs: {
        model: lastModel,
        clip: lastClip,
        lora_name: lora.name,
        strength_model: lora.strength_model ?? 0.8,
        strength_clip: lora.strength_clip ?? 0.8,
      },
    };
    lastModel = [nodeId, 0];
    lastClip = [nodeId, 1];
  });
  const loraEndId = String(1 + loras.length);
  const clipPosId = String(2 + loras.length);
  const clipNegId = String(3 + loras.length);
  const emptyId = String(4 + loras.length);
  const samplerId = String(5 + loras.length);
  const decodeId = String(6 + loras.length);
  const saveId = String(7 + loras.length);
  nodes[clipPosId] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: p.prompt, clip: lastClip },
  };
  nodes[clipNegId] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: p.negative_prompt, clip: lastClip },
  };
  nodes[emptyId] = {
    class_type: 'EmptyLatentImage',
    inputs: { width: p.width, height: p.height, batch_size: p.batch_size ?? 1 },
  };
  nodes[samplerId] = {
    class_type: 'KSampler',
    inputs: {
      ...DEFAULT_KSAMPLER,
      model: lastModel,
      positive: [clipPosId, 0],
      negative: [clipNegId, 0],
      latent_image: [emptyId, 0],
      seed: p.seed,
      steps: p.steps,
      cfg: p.cfg,
      denoise: 1,
    },
  };
  nodes[decodeId] = {
    class_type: 'VAEDecode',
    inputs: { samples: [samplerId, 0], vae: ['1', 2] },
  };
  nodes[saveId] = {
    class_type: 'SaveImage',
    inputs: { images: [decodeId, 0], filename_prefix: p.filename_prefix },
  };
  return nodes;
}

/**
 * Build ControlNet workflow: LoadImage (control) → ControlNetLoader → ApplyControlNet; CheckpointLoaderSimple → CLIPTextEncode → ApplyControlNet → KSampler → VAEDecode → SaveImage.
 */
function buildControlNet(params: ControlNetParams): ComfyUIWorkflow {
  const p = { ...DEFAULT_CONTROLNET, ...params };
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.ckpt_name },
    },
    '2': {
      class_type: 'LoadImage',
      inputs: { image: p.control_image },
    },
    '3': {
      class_type: 'ControlNetLoader',
      inputs: { control_net_name: p.controlnet_name },
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
      class_type: 'ApplyControlNet',
      inputs: {
        positive: ['4', 0],
        negative: ['5', 0],
        control_net: ['3', 0],
        image: ['2', 0],
        strength: p.strength,
      },
    },
    '7': {
      class_type: 'EmptyLatentImage',
      inputs: { width: p.width, height: p.height, batch_size: 1 },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        ...DEFAULT_KSAMPLER,
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['6', 1],
        latent_image: ['7', 0],
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        denoise: 1,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['1', 2] },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: p.filename_prefix },
    },
  };
  return nodes;
}

/**
 * Build a batch of workflows from base_params and variations (each variation overrides seed/prompt).
 * Returns array of ComfyUI workflows; each can be executed separately.
 */
export function buildBatch(params: BatchParams): ComfyUIWorkflow[] {
  const base = params.base_params ?? {};
  const variations = params.variations && params.variations.length > 0 ? params.variations : [{ seed: 0 }];
  return variations.map((v) => buildTxt2Img({ ...base, ...v }));
}

/**
 * Build image-to-caption workflow: LoadImage → BLIPCaption (or similar).
 * Requires a custom node pack that provides a caption node (e.g. ComfyUI-Blip, comfyui-art-venture, img2txt-comfyui-nodes).
 * If your pack uses a different class_type, build the workflow manually or use suggest_nodes.
 */
function buildImageCaption(params: ImageCaptionParams): ComfyUIWorkflow {
  const image = params.image ?? 'input.png';
  const nodes: Record<string, ComfyUINodeDef> = {
    '1': {
      class_type: 'LoadImage',
      inputs: { image },
    },
    '2': {
      class_type: 'BLIPCaption',
      inputs: { image: ['1', 0] },
    },
  };
  return nodes;
}

const TEMPLATES: Record<string, (params: Record<string, unknown>) => ComfyUIWorkflow> = {
  txt2img: (params) => buildTxt2Img(params as Txt2ImgParams),
  txt2img_flux: (params) => buildTxt2ImgFlux(params as Txt2ImgFluxParams),
  img2img: (params) => buildImg2Img(params as Img2ImgParams),
  image_caption: (params) => buildImageCaption(params as ImageCaptionParams),
  inpainting: (params) => buildInpainting(params as InpaintingParams),
  upscale: (params) => buildUpscale(params as UpscaleParams),
  txt2img_lora: (params) => buildTxt2ImgLora(params as Txt2ImgLoraParams),
  controlnet: (params) => buildControlNet(params as ControlNetParams),
  batch: (params) => {
    const workflows = buildBatch(params as BatchParams);
    return workflows.length > 0 ? workflows[0] : buildTxt2Img({});
  },
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
