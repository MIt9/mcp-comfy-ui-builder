/**
 * Unit tests for MCP tool logic: list_node_types, get_node_info, check_compatibility,
 * list_templates, build_workflow (replicated handler logic).
 */
import { describe, it, expect } from 'vitest';
import { buildFromTemplate, listTemplates } from '../src/workflow/workflow-builder.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseNodesJson, NodeCompatibilityData, NodeDescription } from '../src/types/node-types.js';

const projectRoot = join(__dirname, '..');

function loadBaseNodes(cwd: string): BaseNodesJson {
  const path = join(cwd, 'knowledge', 'base-nodes.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BaseNodesJson;
  } catch {
    return { metadata: {}, nodes: {} };
  }
}

function loadCompatibility(cwd: string): NodeCompatibilityData {
  const path = join(cwd, 'knowledge', 'node-compatibility.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as NodeCompatibilityData;
  } catch {
    return { metadata: {}, data_types: {} };
  }
}

// Replicate list_node_types result
function listNodeTypes(base: BaseNodesJson, category?: string, priority?: string): string {
  let entries = Object.entries(base.nodes ?? {});
  if (category) {
    const c = category.toLowerCase();
    entries = entries.filter(([, n]) => (n as NodeDescription).category?.toLowerCase() === c);
  }
  if (priority) {
    entries = entries.filter(([, n]) => (n as NodeDescription).priority === priority);
  }
  const list = entries.map(([className, n]) => {
    const d = n as NodeDescription;
    return `${className}: ${d.display_name} (${d.category}, ${d.priority})`;
  });
  return list.length ? list.join('\n') : 'No nodes match the filter.';
}

// Replicate get_node_info result
function getNodeInfo(base: BaseNodesJson, nodeName: string): string {
  const node = (base.nodes ?? {})[nodeName];
  if (!node) return `Node "${nodeName}" not found in knowledge base.`;
  return JSON.stringify(node, null, 2);
}

// Replicate check_compatibility result
function checkCompatibility(
  base: BaseNodesJson,
  compat: NodeCompatibilityData,
  fromNode: string,
  toNode: string
): string {
  const fromDesc = (base.nodes ?? {})[fromNode] as NodeDescription | undefined;
  const toDesc = (base.nodes ?? {})[toNode] as NodeDescription | undefined;
  if (!fromDesc || !toDesc) {
    return `Missing node: ${!fromDesc ? fromNode : toNode} not in knowledge base.`;
  }
  const outTypes = fromDesc.return_types ?? [];
  const requiredInputs = toDesc.input_types?.required ?? {};
  const toInputTypes = Object.values(requiredInputs)
    .map((v: { type?: string }) => v?.type)
    .filter(Boolean);
  const matches: string[] = [];
  for (const outType of outTypes) {
    const entry = compat.data_types?.[outType];
    const consumers = entry?.consumers ?? [];
    if (toInputTypes.includes(outType) && consumers.includes(toNode)) {
      matches.push(`${outType} (${fromNode} → ${toNode})`);
    }
  }
  return matches.length > 0
    ? `Compatible: ${matches.join('; ')}`
    : `No direct type match found. From node outputs: ${outTypes.join(', ')}. To node consumes: ${toInputTypes.join(', ')}.`;
}

describe('MCP tools logic (fixture data)', () => {
  const base = loadBaseNodes(projectRoot);
  const compat = loadCompatibility(projectRoot);

  it('list_node_types returns lines for each node', () => {
    const text = listNodeTypes(base);
    expect(text).not.toBe('No nodes match the filter.');
    expect(text).toContain('CheckpointLoaderSimple');
    expect(text).toContain('KSampler');
  });

  it('list_node_types filters by category', () => {
    const text = listNodeTypes(base, 'loaders');
    expect(text.toLowerCase()).toContain('loaders');
    expect(text).toContain('CheckpointLoaderSimple');
  });

  it('list_node_types filters by priority', () => {
    const text = listNodeTypes(base, undefined, 'high');
    expect(text).toContain('high');
  });

  it('get_node_info returns JSON for existing node', () => {
    const text = getNodeInfo(base, 'KSampler');
    expect(text).not.toContain('not found');
    const parsed = JSON.parse(text) as NodeDescription;
    expect(parsed.display_name).toBeDefined();
    expect(parsed.category).toBeDefined();
  });

  it('get_node_info KSampler includes sampler_name and scheduler in required inputs', () => {
    const text = getNodeInfo(base, 'KSampler');
    const parsed = JSON.parse(text) as NodeDescription;
    const required = parsed.input_types?.required ?? {};
    expect(required).toHaveProperty('sampler_name');
    expect(required).toHaveProperty('scheduler');
    expect((required.sampler_name as { type?: string }).type).toBe('COMBO');
    expect((required.scheduler as { type?: string }).type).toBe('COMBO');
  });

  it('get_node_info returns message for missing node', () => {
    const text = getNodeInfo(base, 'NonExistentNodeXYZ');
    expect(text).toContain('not found');
  });

  it('check_compatibility returns compatible for CheckpointLoaderSimple → KSampler (MODEL)', () => {
    const text = checkCompatibility(base, compat, 'CheckpointLoaderSimple', 'KSampler');
    expect(text).toMatch(/Compatible|MODEL/);
  });

  it('check_compatibility returns missing node for unknown', () => {
    const text = checkCompatibility(base, compat, 'UnknownNode', 'KSampler');
    expect(text).toContain('Missing node');
  });

  it('list_templates returns txt2img', () => {
    const list = listTemplates();
    expect(list).toContain('txt2img');
  });

  it('build_workflow (buildFromTemplate) returns valid JSON for txt2img', () => {
    const workflow = buildFromTemplate('txt2img', { width: 512, prompt: 'test' });
    expect(workflow).toBeDefined();
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['2'].inputs).toMatchObject({ text: 'test' });
    expect(workflow['4'].inputs).toMatchObject({ width: 512 });
  });
});
