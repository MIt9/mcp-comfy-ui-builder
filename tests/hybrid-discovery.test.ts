/**
 * Unit tests for HybridNodeDiscovery (live + knowledge base).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridNodeDiscovery, setHybridDiscoveryOptions, getHybridDiscovery } from '../src/node-discovery/hybrid-discovery.js';
import type { ObjectInfo } from '../src/types/comfyui-api-types.js';
import type { BaseNodesJson } from '../src/types/node-types.js';

const mockObjectInfo: ObjectInfo = {
  KSampler: {
    input: {
      required: { model: ['MODEL'], positive: ['CONDITIONING'], negative: ['CONDITIONING'], latent_image: ['LATENT'] },
      optional: { seed: ['INT', { default: 0 }] },
    },
    output: ['LATENT'],
    output_name: ['LATENT'],
    category: 'sampling',
    display_name: 'KSampler',
  },
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: ['CHECKPOINT_NAME'] }, optional: {} },
    output: ['MODEL', 'CLIP', 'VAE'],
    output_name: ['MODEL', 'CLIP', 'VAE'],
    category: 'loaders',
  },
};

const baseNodes: BaseNodesJson = {
  metadata: { total_nodes: 1 },
  nodes: {
    CLIPTextEncode: {
      display_name: 'CLIP Text Encode',
      category: 'conditioning',
      description: 'Encode text',
      input_types: {
        required: { text: { type: 'STRING' }, clip: { type: 'CLIP' } },
        optional: {},
      },
      return_types: ['CONDITIONING'],
      return_names: ['CONDITIONING'],
      output_colors: [],
      use_cases: [],
      compatible_outputs: {},
      example_values: {},
      priority: 'high',
    },
  },
};

describe('HybridNodeDiscovery', () => {
  let hybrid: HybridNodeDiscovery;

  beforeEach(() => {
    hybrid = new HybridNodeDiscovery({
      getObjectInfo: vi.fn().mockResolvedValue(mockObjectInfo),
      loadBaseNodes: vi.fn().mockReturnValue(baseNodes),
    });
  });

  it('getNode returns live node when available', async () => {
    const node = await hybrid.getNode('KSampler');
    expect(node).not.toBeNull();
    expect(node!.class_name).toBe('KSampler');
    expect(node!.source).toBe('live');
    expect(node!.category).toBe('sampling');
    expect(node!.output).toEqual(['LATENT']);
    expect(node!.input.required).toHaveProperty('model');
  });

  it('getNode returns knowledge node when not in live', async () => {
    const node = await hybrid.getNode('CLIPTextEncode');
    expect(node).not.toBeNull();
    expect(node!.class_name).toBe('CLIPTextEncode');
    expect(node!.source).toBe('knowledge');
    expect(node!.category).toBe('conditioning');
    expect(node!.output).toEqual(['CONDITIONING']);
  });

  it('getNode returns null for unknown node', async () => {
    const node = await hybrid.getNode('UnknownNode');
    expect(node).toBeNull();
  });

  it('searchNodes merges live and knowledge', async () => {
    const list = await hybrid.searchNodes('');
    expect(list.length).toBeGreaterThanOrEqual(2);
    const classNames = list.map((n) => n.class_name);
    expect(classNames).toContain('KSampler');
    expect(classNames).toContain('CheckpointLoaderSimple');
    expect(classNames).toContain('CLIPTextEncode');
  });

  it('searchNodes filters by query', async () => {
    const list = await hybrid.searchNodes('Sampler');
    expect(list.some((n) => n.class_name === 'KSampler')).toBe(true);
    expect(list.every((n) => n.class_name.toLowerCase().includes('sampler') || n.display_name.toLowerCase().includes('sampler'))).toBe(true);
  });

  it('searchNodes filters by category', async () => {
    const list = await hybrid.searchNodes('', { category: 'sampling' });
    expect(list.every((n) => n.category === 'sampling')).toBe(true);
    expect(list.some((n) => n.class_name === 'KSampler')).toBe(true);
  });

  it('listNodeCategories returns unique categories', async () => {
    const categories = await hybrid.listNodeCategories();
    expect(categories).toContain('sampling');
    expect(categories).toContain('loaders');
    expect(categories).toContain('conditioning');
    expect(categories).toEqual([...new Set(categories)].sort());
  });
});

describe('setHybridDiscoveryOptions', () => {
  it('sets singleton instance', () => {
    setHybridDiscoveryOptions({
      getObjectInfo: vi.fn().mockResolvedValue({}),
      loadBaseNodes: vi.fn().mockReturnValue({ metadata: {}, nodes: {} }),
    });
    expect(getHybridDiscovery()).not.toBeNull();
  });
});
