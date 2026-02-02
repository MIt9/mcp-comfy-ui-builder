/**
 * In-memory store for dynamic workflow contexts with TTL.
 * Used by MCP tools create_workflow, add_node, get_workflow_json, etc.
 */
import { createWorkflow, type WorkflowContext } from './dynamic-builder.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class WorkflowStore {
  private contexts = new Map<string, WorkflowContext>();
  private readonly ttl: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
  }

  /**
   * Create a new workflow context and return its id.
   */
  create(): string {
    const ctx = createWorkflow();
    this.contexts.set(ctx.id, ctx);
    return ctx.id;
  }

  /**
   * Get workflow context by id, or null if not found or expired.
   */
  get(id: string): WorkflowContext | null {
    return this.contexts.get(id) ?? null;
  }

  /**
   * Update (replace) a context. Used when restoring or cloning.
   */
  update(id: string, ctx: WorkflowContext): void {
    this.contexts.set(id, ctx);
  }

  /**
   * Remove a workflow context by id.
   */
  delete(id: string): void {
    this.contexts.delete(id);
  }

  /**
   * Remove contexts older than TTL.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [id, ctx] of this.contexts.entries()) {
      if (now - ctx.createdAt.getTime() > this.ttl) {
        this.contexts.delete(id);
      }
    }
  }
}

/** Singleton store for MCP server. */
let defaultStore: WorkflowStore | null = null;

/**
 * Get the default workflow store (singleton). Creates one on first call.
 */
export function getWorkflowStore(ttlMs?: number): WorkflowStore {
  if (!defaultStore) {
    defaultStore = new WorkflowStore(ttlMs);
  }
  return defaultStore;
}
