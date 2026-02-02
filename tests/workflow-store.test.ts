/**
 * Unit tests for WorkflowStore: create, get, update, delete, cleanup.
 */
import { describe, it, expect } from 'vitest';
import { WorkflowStore } from '../src/workflow/workflow-store.js';

describe('WorkflowStore', () => {
  it('create returns workflow id and get returns context', () => {
    const store = new WorkflowStore(60 * 60 * 1000);
    const id = store.create();
    expect(id).toBeDefined();
    expect(id.startsWith('wf_')).toBe(true);
    const ctx = store.get(id);
    expect(ctx).not.toBeNull();
    expect(ctx!.workflow).toEqual({});
    expect(ctx!.nodeCounter).toBe(0);
  });

  it('get returns null for unknown id', () => {
    const store = new WorkflowStore();
    expect(store.get('wf_unknown')).toBeNull();
  });

  it('delete removes context', () => {
    const store = new WorkflowStore();
    const id = store.create();
    expect(store.get(id)).not.toBeNull();
    store.delete(id);
    expect(store.get(id)).toBeNull();
  });

  it('update replaces context', () => {
    const store = new WorkflowStore();
    const id = store.create();
    const ctx = store.get(id)!;
    ctx.nodeCounter = 5;
    ctx.workflow['1'] = { class_type: 'LoadImage', inputs: { image: 'x.png' } };
    store.update(id, ctx);
    const got = store.get(id)!;
    expect(got.nodeCounter).toBe(5);
    expect(got.workflow['1'].class_type).toBe('LoadImage');
  });

  it('cleanup removes expired contexts', () => {
    const store = new WorkflowStore(100); // 100 ms TTL
    const id = store.create();
    expect(store.get(id)).not.toBeNull();
    // Make context appear old by replacing with past createdAt
    const ctx = store.get(id)!;
    ctx.createdAt = new Date(Date.now() - 200);
    store.update(id, ctx);
    store.cleanup();
    expect(store.get(id)).toBeNull();
  });
});
