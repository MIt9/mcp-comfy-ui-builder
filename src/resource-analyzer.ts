/**
 * Resource analyzer: interpret ComfyUI system_stats (VRAM/RAM) and produce
 * recommendations for model size, resolution, and batch size to avoid OOM.
 */
import type { SystemStatsResponse, ComfyUIWorkflow } from './types/comfyui-api-types.js';

const BYTES_PER_GB = 1024 * 1024 * 1024;

export type ResourceTier = 'low' | 'medium' | 'high' | 'very_high' | 'unknown';

export interface ResourceRecommendations {
  /** Resource tier derived from VRAM (primary GPU). */
  tier: ResourceTier;
  /** Primary GPU name (first device). */
  gpu_name: string;
  /** VRAM total (GB). */
  vram_total_gb: number;
  /** VRAM free (GB) at query time. */
  vram_free_gb: number;
  /** RAM total (GB). */
  ram_total_gb: number;
  /** RAM free (GB) at query time. */
  ram_free_gb: number;
  /** Recommended max width for generation (e.g. 512, 768, 1024). */
  max_width: number;
  /** Recommended max height for generation. */
  max_height: number;
  /** Suggested model size: light (SD 1.5 small), medium, heavy (SD XL / large). */
  suggested_model_size: 'light' | 'medium' | 'heavy';
  /** Recommended max batch_size for txt2img. */
  max_batch_size: number;
  /** Short human-readable summary. */
  summary: string;
  /** Optional warnings (e.g. low VRAM). */
  warnings: string[];
  /**
   * Whether VRAM is sufficient for FLUX (dual-CLIP, ~12GB+ recommended).
   * Call get_system_resources before using txt2img_flux; if false, use txt2img (SD/SDXL) or lower resolution.
   */
  flux_ready: boolean;
  /** Max width recommended for FLUX (0 if flux_ready is false). */
  flux_max_width: number;
  /** Max height recommended for FLUX (0 if flux_ready is false). */
  flux_max_height: number;
  /**
   * Optional platform-specific model hints (e.g. Apple Silicon: M-Flux, ComfyUI-MLX).
   * Use when gpu_name suggests M1/M2/M3 or MPS; these models may run with lower VRAM than desktop FLUX.
   */
  platform_hints?: string[];
  /**
   * Recommended timeout for execute_workflow_sync (ms). MPS/Apple Silicon is ~2–3× slower; value is higher on Apple.
   * Use when timeout_ms is not passed to avoid premature timeout on slow backends.
   */
  recommended_timeout_ms: number;
  /** Raw stats snapshot (for debugging). */
  raw?: {
    vram_total_bytes: number;
    vram_free_bytes: number;
    ram_total_bytes: number;
    ram_free_bytes: number;
  };
}

function bytesToGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

/**
 * Derive resource tier from total VRAM (GB).
 * Thresholds are heuristic; SD 1.5 ~2–4 GB, SD XL ~8–12+ GB.
 */
function tierFromVramGb(vramGb: number): ResourceTier {
  if (vramGb <= 0) return 'unknown';
  if (vramGb < 4) return 'low';
  if (vramGb < 8) return 'medium';
  if (vramGb < 12) return 'high';
  return 'very_high';
}

/**
 * Recommend max resolution and model size from tier.
 */
function recommendationsFromTier(
  tier: ResourceTier,
  vramFreeGb: number,
  vramTotalGb: number
): {
  max_width: number;
  max_height: number;
  suggested_model_size: 'light' | 'medium' | 'heavy';
  max_batch_size: number;
  summary: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const freeRatio = vramTotalGb > 0 ? vramFreeGb / vramTotalGb : 1;

  switch (tier) {
    case 'low':
      return {
        max_width: 512,
        max_height: 512,
        suggested_model_size: 'light',
        max_batch_size: 1,
        summary: 'Low VRAM: use SD 1.5 or small checkpoints, 512×512, batch 1.',
        warnings: freeRatio < 0.2 ? ['VRAM almost full; consider closing other GPU apps.'] : [],
      };
    case 'medium':
      return {
        max_width: 768,
        max_height: 768,
        suggested_model_size: 'medium',
        max_batch_size: 2,
        summary: 'Medium VRAM: 768×768, medium models or SD 1.5, batch 1–2.',
        warnings: freeRatio < 0.25 ? ['Low free VRAM; prefer batch_size 1.'] : [],
      };
    case 'high':
      return {
        max_width: 1024,
        max_height: 1024,
        suggested_model_size: 'heavy',
        max_batch_size: 4,
        summary: 'High VRAM: 1024×1024, SD XL possible; batch 2–4.',
        warnings: freeRatio < 0.2 ? ['Free VRAM low; reduce resolution or batch.'] : [],
      };
    case 'very_high':
      return {
        max_width: 1024,
        max_height: 1024,
        suggested_model_size: 'heavy',
        max_batch_size: 8,
        summary: 'Very high VRAM: SD XL and FLUX; batch 4–8.',
        warnings: [],
      };
    default:
      return {
        max_width: 512,
        max_height: 512,
        suggested_model_size: 'light',
        max_batch_size: 1,
        summary: 'Unknown GPU/VRAM: use conservative defaults (512×512, light model, batch 1).',
        warnings: ['Could not read VRAM; use low settings to avoid OOM.'],
      };
  }
}

/**
 * Analyze ComfyUI system_stats and return recommendations for model/resolution/batch.
 */
export function analyzeSystemResources(stats: SystemStatsResponse): ResourceRecommendations {
  const sys = stats.system ?? {};
  const devices = stats.devices ?? [];
  const primary = devices[0];

  const ramTotal = Number(sys.ram_total) || 0;
  const ramFree = Number(sys.ram_free) || 0;
  const vramTotal = primary ? Number(primary.vram_total) || 0 : 0;
  const vramFree = primary ? Number(primary.vram_free) || 0 : 0;

  const vramTotalGb = bytesToGb(vramTotal);
  const vramFreeGb = bytesToGb(vramFree);
  const ramTotalGb = bytesToGb(ramTotal);
  const ramFreeGb = bytesToGb(ramFree);

  const tier = tierFromVramGb(vramTotalGb);
  const gpuName = primary?.name ?? 'unknown';
  const rec = recommendationsFromTier(tier, vramFreeGb, vramTotalGb);

  /** FLUX needs ~12GB+ VRAM (dual CLIP + large UNet). high/very_high = 12GB+ */
  const fluxReady = tier === 'high' || tier === 'very_high';
  const fluxMax = fluxReady ? { width: 1024, height: 1024 } : { width: 0, height: 0 };

  /** Apple Silicon (M1/M2/M3, MPS): suggest M-Flux, ComfyUI-MLX and other MPS/MLX-optimized models. */
  const platformHints: string[] = [];
  const gpuLower = String(gpuName).toLowerCase();
  const isMpsOrApple = /apple|m1|m2|m3|mps|metal/.test(gpuLower);
  if (isMpsOrApple) {
    platformHints.push(
      'Apple Silicon (M1/M2/M3): M-Flux (Mflux-ComfyUI), ComfyUI-MLX and other MPS/MLX-optimized models may run with lower memory than desktop FLUX; use txt2img for SD 1.5/SDXL, or install M-Flux/MLX nodes for FLUX-style generation.'
    );
  }

  /** Base timeout by tier (typical 1024×1024 ~28 steps). MPS/Apple ~2.5× slower. */
  const baseTimeoutByTier: Record<ResourceTier, number> = {
    low: 120_000,
    medium: 240_000,
    high: 480_000,
    very_high: 600_000,
    unknown: 300_000,
  };
  const baseTimeout = baseTimeoutByTier[tier];
  const recommendedTimeoutMs = isMpsOrApple ? Math.round(baseTimeout * 2.5) : baseTimeout;

  return {
    tier,
    gpu_name: gpuName,
    vram_total_gb: vramTotalGb,
    vram_free_gb: vramFreeGb,
    ram_total_gb: ramTotalGb,
    ram_free_gb: ramFreeGb,
    max_width: rec.max_width,
    max_height: rec.max_height,
    suggested_model_size: rec.suggested_model_size,
    max_batch_size: rec.max_batch_size,
    summary: rec.summary,
    warnings: rec.warnings,
    flux_ready: fluxReady,
    flux_max_width: fluxMax.width,
    flux_max_height: fluxMax.height,
    ...(platformHints.length > 0 && { platform_hints: platformHints }),
    recommended_timeout_ms: recommendedTimeoutMs,
    raw: {
      vram_total_bytes: vramTotal,
      vram_free_bytes: vramFree,
      ram_total_bytes: ramTotal,
      ram_free_bytes: ramFree,
    },
  };
}

/**
 * Extract max width/height from a ComfyUI workflow (e.g. EmptyLatentImage, or any node with width/height inputs).
 * Returns the maximum dimensions found; null if none.
 */
export function getWorkflowResolution(workflow: ComfyUIWorkflow): { width: number; height: number } | null {
  let maxW = 0;
  let maxH = 0;
  for (const node of Object.values(workflow)) {
    const inputs = node?.inputs ?? {};
    const w = typeof inputs.width === 'number' ? inputs.width : 0;
    const h = typeof inputs.height === 'number' ? inputs.height : 0;
    if (w > 0 && h > 0) {
      if (w > maxW) maxW = w;
      if (h > maxH) maxH = h;
    }
  }
  return maxW > 0 && maxH > 0 ? { width: maxW, height: maxH } : null;
}
