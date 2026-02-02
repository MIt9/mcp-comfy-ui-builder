/**
 * KnowledgeBaseUpdater: addNode, updateCompatibility, generateChangelog.
 * Writes to knowledge/base-nodes.json, custom-nodes.json, node-compatibility.json, CHANGELOG.md.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NodeDescription, NodeCompatibilityData, BaseNodesJson } from '../types/node-types.js';

function getKnowledgePath(): string {
  const envDir = process.env.COMFYUI_KNOWLEDGE_DIR?.trim();
  if (envDir) return envDir;
  return join(process.cwd(), 'knowledge');
}

/** Ensure knowledge directory exists before any write (avoids ENOENT when sync_nodes_to_knowledge runs from another app cwd). */
function ensureKnowledgeDir(): void {
  const dir = getKnowledgePath();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJson<T>(path: string): T {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as T;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Add or update a node in base-nodes.json.
 * (custom-nodes.json holds packs only; all node descriptions go to base-nodes.json.)
 */
export function addNode(
  className: string,
  description: NodeDescription,
  _isCustom?: boolean
): void {
  ensureKnowledgeDir();
  const knowledgeDir = getKnowledgePath();
  const file = join(knowledgeDir, 'base-nodes.json');
  if (!existsSync(file)) {
    const initial: BaseNodesJson = {
      metadata: { version: '1.0.0', last_updated: new Date().toISOString().slice(0, 10), total_nodes: 1 },
      nodes: { [className]: description },
    };
    writeJson(file, initial);
    return;
  }
  const data = readJson<BaseNodesJson>(file);
  data.nodes[className] = description;
  data.metadata ??= {};
  data.metadata.last_updated = new Date().toISOString().slice(0, 10);
  data.metadata.total_nodes = Object.keys(data.nodes).length;
  writeJson(file, data);
}

/**
 * Update node-compatibility.json: add/update producers and consumers for return types of the node.
 */
export function updateCompatibility(nodeClass: string, desc: NodeDescription): void {
  ensureKnowledgeDir();
  const knowledgeDir = getKnowledgePath();
  const file = join(knowledgeDir, 'node-compatibility.json');
  const data: NodeCompatibilityData = existsSync(file)
    ? readJson<NodeCompatibilityData>(file)
    : { metadata: { version: '1.0.0', last_updated: new Date().toISOString().slice(0, 10) }, data_types: {} };

  for (const returnType of desc.return_types) {
    let entry = data.data_types[returnType];
    if (!entry) {
      entry = { producers: [], consumers: [] };
      data.data_types[returnType] = entry;
    }
    if (!entry.producers.includes(nodeClass)) {
      entry.producers.push(nodeClass);
    }
    const consumers = desc.compatible_outputs[returnType];
    if (Array.isArray(consumers)) {
      for (const c of consumers) {
        if (!entry.consumers.includes(c)) {
          entry.consumers.push(c);
        }
      }
    }
  }

  data.metadata ??= {};
  data.metadata.last_updated = new Date().toISOString().slice(0, 10);
  writeJson(file, data);
}

/**
 * Append new nodes to knowledge/CHANGELOG.md.
 */
export function generateChangelog(newNodes: Array<{ className: string; description: NodeDescription }>): void {
  if (newNodes.length === 0) return;
  ensureKnowledgeDir();
  const knowledgeDir = getKnowledgePath();
  const file = join(knowledgeDir, 'CHANGELOG.md');
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    '',
    `## ${date}`,
    '',
    '### Added nodes',
    ...newNodes.map(({ className, description }) => `- **${className}** — ${description.display_name}: ${description.description}`),
    '',
  ];
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '# Changelog\n';
  writeFileSync(file, existing + lines.join('\n'), 'utf8');
}
