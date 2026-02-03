/**
 * Unit tests for resource-analyzer (analyzeSystemResources, getWorkflowResolution).
 */
import { describe, it, expect } from 'vitest';
import { analyzeSystemResources, getWorkflowResolution } from '../src/resource-analyzer.js';
import type { SystemStatsResponse, ComfyUIWorkflow } from '../src/types/comfyui-api-types.js';

const BYTES_PER_GB = 1024 * 1024 * 1024;

function makeStats(vramTotalGb: number, vramFreeGb?: number, ramTotalGb = 16, ramFreeGb = 8): SystemStatsResponse {
  const vramFree = (vramFreeGb ?? vramTotalGb * 0.5) * BYTES_PER_GB;
  const vramTotal = vramTotalGb * BYTES_PER_GB;
  return {
    system: {
      ram_total: ramTotalGb * BYTES_PER_GB,
      ram_free: ramFreeGb * BYTES_PER_GB,
    },
    devices: [
      {
        name: 'Test GPU',
        vram_total: vramTotal,
        vram_free: vramFree,
      },
    ],
  };
}

describe('resource-analyzer', () => {
  describe('analyzeSystemResources', () => {
    it('returns low tier for < 4 GB VRAM', () => {
      const stats = makeStats(3);
      const rec = analyzeSystemResources(stats);
      expect(rec.tier).toBe('low');
      expect(rec.max_width).toBe(512);
      expect(rec.max_height).toBe(512);
      expect(rec.suggested_model_size).toBe('light');
      expect(rec.max_batch_size).toBe(1);
    });

    it('returns medium tier for 4–8 GB VRAM', () => {
      const stats = makeStats(6);
      const rec = analyzeSystemResources(stats);
      expect(rec.tier).toBe('medium');
      expect(rec.max_width).toBe(768);
      expect(rec.max_height).toBe(768);
      expect(rec.suggested_model_size).toBe('medium');
      expect(rec.max_batch_size).toBe(2);
    });

    it('returns high tier for 8–12 GB VRAM', () => {
      const stats = makeStats(10);
      const rec = analyzeSystemResources(stats);
      expect(rec.tier).toBe('high');
      expect(rec.max_width).toBe(1024);
      expect(rec.max_height).toBe(1024);
      expect(rec.suggested_model_size).toBe('heavy');
      expect(rec.max_batch_size).toBe(4);
    });

    it('returns very_high tier for 12+ GB VRAM', () => {
      const stats = makeStats(16);
      const rec = analyzeSystemResources(stats);
      expect(rec.tier).toBe('very_high');
      expect(rec.max_width).toBe(1024);
      expect(rec.max_height).toBe(1024);
      expect(rec.suggested_model_size).toBe('heavy');
      expect(rec.max_batch_size).toBe(8);
      expect(rec.flux_ready).toBe(true);
      expect(rec.flux_max_width).toBe(1024);
      expect(rec.flux_max_height).toBe(1024);
    });

    it('sets flux_ready true only for high/very_high VRAM (12GB+)', () => {
      expect(analyzeSystemResources(makeStats(3)).flux_ready).toBe(false);
      expect(analyzeSystemResources(makeStats(6)).flux_ready).toBe(false);
      expect(analyzeSystemResources(makeStats(10)).flux_ready).toBe(true);
      expect(analyzeSystemResources(makeStats(16)).flux_ready).toBe(true);
      expect(analyzeSystemResources(makeStats(10)).flux_max_width).toBe(1024);
      expect(analyzeSystemResources(makeStats(3)).flux_max_width).toBe(0);
    });

    it('returns unknown tier when no devices', () => {
      const stats: SystemStatsResponse = {
        system: { ram_total: 0, ram_free: 0 },
        devices: [],
      };
      const rec = analyzeSystemResources(stats);
      expect(rec.tier).toBe('unknown');
      expect(rec.gpu_name).toBe('unknown');
      expect(rec.max_width).toBe(512);
      expect(rec.warnings.length).toBeGreaterThan(0);
    });

    it('includes gpu_name and raw bytes', () => {
      const stats = makeStats(8);
      const rec = analyzeSystemResources(stats);
      expect(rec.gpu_name).toBe('Test GPU');
      expect(rec.raw).toBeDefined();
      expect(rec.raw!.vram_total_bytes).toBe(8 * BYTES_PER_GB);
      expect(rec.vram_total_gb).toBe(8);
      expect(rec.ram_total_gb).toBe(16);
    });

    it('adds platform_hints for Apple Silicon (M1/M2/M3, MPS)', () => {
      const statsApple: SystemStatsResponse = {
        system: { ram_total: 16 * BYTES_PER_GB, ram_free: 8 * BYTES_PER_GB },
        devices: [
          { name: 'Apple M1', vram_total: 8 * BYTES_PER_GB, vram_free: 4 * BYTES_PER_GB },
        ],
      };
      const rec = analyzeSystemResources(statsApple);
      expect(rec.platform_hints).toBeDefined();
      expect(rec.platform_hints!.length).toBeGreaterThan(0);
      expect(rec.platform_hints![0]).toMatch(/Apple Silicon|M-Flux|ComfyUI-MLX|MPS/);
    });

    it('does not add platform_hints for non-Apple GPU', () => {
      const rec = analyzeSystemResources(makeStats(8));
      expect(rec.platform_hints).toBeUndefined();
    });

    it('returns recommended_timeout_ms (higher on Apple/MPS)', () => {
      const recLow = analyzeSystemResources(makeStats(3));
      expect(recLow.recommended_timeout_ms).toBe(120_000);
      const recHigh = analyzeSystemResources(makeStats(16));
      expect(recHigh.recommended_timeout_ms).toBe(600_000);
      const statsApple: SystemStatsResponse = {
        system: { ram_total: 16 * BYTES_PER_GB, ram_free: 8 * BYTES_PER_GB },
        devices: [
          { name: 'Apple M1', vram_total: 16 * BYTES_PER_GB, vram_free: 8 * BYTES_PER_GB },
        ],
      };
      const recApple = analyzeSystemResources(statsApple);
      expect(recApple.recommended_timeout_ms).toBe(1_500_000); // 600_000 * 2.5
    });
  });

  describe('getWorkflowResolution', () => {
    it('returns max width/height from EmptyLatentImage', () => {
      const workflow: ComfyUIWorkflow = {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'x.safetensors' } },
        '5': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 768, batch_size: 1 } },
      };
      const dims = getWorkflowResolution(workflow);
      expect(dims).toEqual({ width: 1024, height: 768 });
    });

    it('returns null when no width/height in workflow', () => {
      const workflow: ComfyUIWorkflow = {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'x.safetensors' } },
      };
      const dims = getWorkflowResolution(workflow);
      expect(dims).toBeNull();
    });
  });
});
