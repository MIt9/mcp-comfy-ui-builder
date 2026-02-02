/**
 * Hybrid Node Discovery: live ComfyUI /object_info + knowledge base.
 * getNode (live first, fallback KB), searchNodes, listNodeCategories, syncToKnowledgeBase.
 */
import type { ObjectInfo, ObjectInfoNode } from '../types/comfyui-api-types.js';
import type { BaseNodesJson, NodeDescription } from '../types/node-types.js';
import { addNode, updateCompatibility } from './updater.js';

/** Normalized node info for get_node_inputs / get_node_outputs (live or KB). */
export interface NodeInfo {
  class_name: string;
  display_name: string;
  category: string;
  description?: string;
  input: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
  output: string[];
  output_name: string[];
  source: 'live' | 'knowledge';
}

/** Filters for search_nodes. */
export interface NodeFilters {
  category?: string;
  input_type?: string;
  output_type?: string;
}

/** Result of syncing live nodes to knowledge base. */
export interface SyncResult {
  added: string[];
  skipped: number;
  errors: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeLiveNode(className: string, raw: ObjectInfoNode): NodeInfo {
  const required = raw.input?.required ?? {};
  const optional = raw.input?.optional ?? {};
  return {
    class_name: className,
    display_name: raw.display_name ?? raw.name ?? className,
    category: raw.category ?? 'unknown',
    description: raw.description,
    input: { required: { ...required }, optional: { ...optional } },
    output: raw.output ?? [],
    output_name: raw.output_name ?? [],
    source: 'live',
  };
}

function normalizeKnowledgeNode(className: string, desc: NodeDescription): NodeInfo {
  const required: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(desc.input_types?.required ?? {})) {
    const s = spec as { type?: string; default?: unknown };
    required[name] = s?.type != null ? [s.type, s.default != null ? { default: s.default } : {}] : [];
  }
  return {
    class_name: className,
    display_name: desc.display_name ?? className,
    category: desc.category ?? 'unknown',
    description: desc.description,
    input: { required, optional: desc.input_types?.optional ?? {} },
    output: desc.return_types ?? [],
    output_name: desc.return_names ?? [],
    source: 'knowledge',
  };
}

/** Extract input type string from live format ([type, config] or plain type). */
function inputTypeOf(value: unknown): string {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  if (typeof value === 'string') return value;
  return 'UNKNOWN';
}

/** Check if a node matches filters (category, input_type, output_type). */
function nodeMatchesFilters(info: NodeInfo, filters?: NodeFilters): boolean {
  if (!filters) return true;
  if (filters.category != null && filters.category !== '' && info.category !== filters.category) {
    return false;
  }
  if (filters.input_type != null && filters.input_type !== '') {
    const types = Object.values(info.input.required ?? {})
      .concat(Object.values(info.input.optional ?? {}))
      .map(inputTypeOf);
    if (!types.some((t) => t.toUpperCase() === filters.input_type!.toUpperCase())) {
      return false;
    }
  }
  if (filters.output_type != null && filters.output_type !== '') {
    const t = filters.output_type.toUpperCase();
    if (!info.output.some((o) => o.toUpperCase() === t)) return false;
  }
  return true;
}

/** Check if node matches text query (class_name, display_name, description, category). */
function nodeMatchesQuery(info: NodeInfo, query: string): boolean {
  if (!query || query.trim() === '') return true;
  const q = query.toLowerCase().trim();
  return (
    info.class_name.toLowerCase().includes(q) ||
    info.display_name.toLowerCase().includes(q) ||
    (info.description ?? '').toLowerCase().includes(q) ||
    info.category.toLowerCase().includes(q)
  );
}

export interface HybridNodeDiscoveryOptions {
  getObjectInfo: () => Promise<ObjectInfo>;
  loadBaseNodes: () => BaseNodesJson;
}

export class HybridNodeDiscovery {
  private getObjectInfo: () => Promise<ObjectInfo>;
  private loadBaseNodes: () => BaseNodesJson;
  private liveCache: { data: ObjectInfo; expires: number } | null = null;

  constructor(options: HybridNodeDiscoveryOptions) {
    this.getObjectInfo = options.getObjectInfo;
    this.loadBaseNodes = options.loadBaseNodes;
  }

  /** Invalidate live cache (e.g. after sync). */
  invalidateCache(): void {
    this.liveCache = null;
  }

  /** Get live object_info with 5-minute cache. */
  async getLiveObjectInfo(): Promise<ObjectInfo | null> {
    const now = Date.now();
    if (this.liveCache && this.liveCache.expires > now) {
      return this.liveCache.data;
    }
    try {
      const data = await this.getObjectInfo();
      this.liveCache = { data, expires: now + CACHE_TTL_MS };
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Get node by class name. Prefer live ComfyUI; fallback to knowledge base.
   */
  async getNode(className: string): Promise<NodeInfo | null> {
    const live = await this.getLiveObjectInfo();
    if (live != null && live[className] != null) {
      return normalizeLiveNode(className, live[className]!);
    }
    const base = this.loadBaseNodes();
    const desc = base.nodes?.[className] as NodeDescription | undefined;
    if (desc) {
      return normalizeKnowledgeNode(className, desc);
    }
    return null;
  }

  /**
   * Search nodes by query and optional filters (category, input_type, output_type).
   * Merges live and knowledge; live entries override KB for same class_name.
   */
  async searchNodes(query: string, filters?: NodeFilters): Promise<NodeInfo[]> {
    const live = await this.getLiveObjectInfo();
    const base = this.loadBaseNodes();
    const byClass = new Map<string, NodeInfo>();

    if (base.nodes) {
      for (const [className, desc] of Object.entries(base.nodes)) {
        const info = normalizeKnowledgeNode(className, desc as NodeDescription);
        byClass.set(className, info);
      }
    }
    if (live) {
      for (const [className, raw] of Object.entries(live)) {
        byClass.set(className, normalizeLiveNode(className, raw));
      }
    }

    let list = Array.from(byClass.values());
    if (query && query.trim() !== '') {
      list = list.filter((info) => nodeMatchesQuery(info, query));
    }
    if (filters) {
      list = list.filter((info) => nodeMatchesFilters(info, filters));
    }
    return list;
  }

  /**
   * List all unique categories from live and knowledge base.
   */
  async listNodeCategories(): Promise<string[]> {
    const live = await this.getLiveObjectInfo();
    const base = this.loadBaseNodes();
    const set = new Set<string>();
    if (base.nodes) {
      for (const desc of Object.values(base.nodes)) {
        const cat = (desc as NodeDescription).category;
        if (cat) set.add(cat);
      }
    }
    if (live) {
      for (const raw of Object.values(live)) {
        if (raw.category) set.add(raw.category);
      }
    }
    return Array.from(set).sort();
  }

  /**
   * Sync nodes from live ComfyUI to knowledge base. Adds only nodes not already in base-nodes.
   */
  async syncToKnowledgeBase(): Promise<SyncResult> {
    const result: SyncResult = { added: [], skipped: 0, errors: [] };
    let live: ObjectInfo;
    try {
      live = await this.getObjectInfo();
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : 'Failed to fetch /object_info');
      return result;
    }
    const base = this.loadBaseNodes();
    const existing = new Set(Object.keys(base.nodes ?? {}));

    for (const [className, raw] of Object.entries(live)) {
      if (existing.has(className)) {
        result.skipped += 1;
        continue;
      }
      try {
        const desc = objectInfoToNodeDescription(className, raw);
        addNode(className, desc, false);
        updateCompatibility(className, desc);
        result.added.push(className);
      } catch (e) {
        result.errors.push(`${className}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.invalidateCache();
    return result;
  }
}

/**
 * Build minimal NodeDescription from ComfyUI object_info entry for sync.
 */
function objectInfoToNodeDescription(className: string, raw: ObjectInfoNode): NodeDescription {
  const required: Record<string, { type: string; description?: string; default?: unknown }> = {};
  for (const [name, value] of Object.entries(raw.input?.required ?? {})) {
    const typeStr = inputTypeOf(value);
    required[name] = { type: typeStr };
    if (Array.isArray(value) && value.length > 1 && value[1] && typeof value[1] === 'object' && 'default' in (value[1] as object)) {
      required[name].default = (value[1] as { default?: unknown }).default;
    }
  }
  const optional: Record<string, { type: string; default?: unknown }> = {};
  for (const [name, value] of Object.entries(raw.input?.optional ?? {})) {
    optional[name] = { type: inputTypeOf(value) };
    if (Array.isArray(value) && value.length > 1 && value[1] && typeof value[1] === 'object' && 'default' in (value[1] as object)) {
      optional[name].default = (value[1] as { default?: unknown }).default;
    }
  }
  return {
    display_name: raw.display_name ?? raw.name ?? className,
    category: raw.category ?? 'unknown',
    description: raw.description ?? `Node ${className}`,
    input_types: { required, optional },
    return_types: raw.output ?? [],
    return_names: raw.output_name ?? [],
    output_colors: [],
    use_cases: [],
    compatible_outputs: {},
    example_values: {},
    priority: 'low',
  };
}

/** Singleton instance; call setHybridDiscoveryOptions() from MCP server. */
let instance: HybridNodeDiscovery | null = null;

export function setHybridDiscoveryOptions(options: HybridNodeDiscoveryOptions): void {
  instance = new HybridNodeDiscovery(options);
}

export function getHybridDiscovery(): HybridNodeDiscovery | null {
  return instance;
}
