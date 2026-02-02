/**
 * Unit tests for dynamic workflow builder: createWorkflow, addNode, connectNodes, removeNode, setNodeInput, getWorkflow, validateWorkflow.
 */
import { describe, it, expect } from 'vitest';
import {
  createWorkflow,
  addNode,
  connectNodes,
  removeNode,
  setNodeInput,
  getWorkflow,
  validateWorkflow,
} from '../src/workflow/dynamic-builder.js';

describe('dynamic-builder', () => {
  it('createWorkflow returns context with id, empty workflow, nodeCounter 0', () => {
    const ctx = createWorkflow();
    expect(ctx.id).toBeDefined();
    expect(ctx.id.startsWith('wf_')).toBe(true);
    expect(ctx.workflow).toEqual({});
    expect(ctx.nodeCounter).toBe(0);
    expect(ctx.createdAt).toBeInstanceOf(Date);
  });

  it('addNode adds node and returns node id', () => {
    const ctx = createWorkflow();
    const id1 = addNode(ctx, 'CheckpointLoaderSimple', { ckpt_name: 'model.safetensors' });
    expect(id1).toBe('1');
    expect(ctx.workflow['1']).toEqual({
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'model.safetensors' },
    });
    const id2 = addNode(ctx, 'CLIPTextEncode', {});
    expect(id2).toBe('2');
    expect(ctx.nodeCounter).toBe(2);
  });

  it('connectNodes sets input to [fromNodeId, outputIndex]', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', { ckpt_name: 'x.safetensors' });
    addNode(ctx, 'CLIPTextEncode', { text: 'a cat' });
    connectNodes(ctx, '1', 1, '2', 'clip');
    expect(ctx.workflow['2'].inputs.clip).toEqual(['1', 1]);
  });

  it('connectNodes throws if toNode or fromNode not found', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', {});
    expect(() => connectNodes(ctx, '1', 0, '99', 'model')).toThrow('Node "99" not found');
    expect(() => connectNodes(ctx, '99', 0, '1', 'model')).toThrow('Node "99" not found');
  });

  it('removeNode deletes node', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', {});
    addNode(ctx, 'CLIPTextEncode', {});
    removeNode(ctx, '2');
    expect(ctx.workflow['1']).toBeDefined();
    expect(ctx.workflow['2']).toBeUndefined();
  });

  it('removeNode throws if node not found', () => {
    const ctx = createWorkflow();
    expect(() => removeNode(ctx, '1')).toThrow('Node "1" not found');
  });

  it('setNodeInput sets literal input', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CLIPTextEncode', { text: 'old' });
    setNodeInput(ctx, '1', 'text', 'new prompt');
    expect(ctx.workflow['1'].inputs.text).toBe('new prompt');
  });

  it('setNodeInput throws if node not found', () => {
    const ctx = createWorkflow();
    expect(() => setNodeInput(ctx, '1', 'text', 'x')).toThrow('Node "1" not found');
  });

  it('getWorkflow returns same reference', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', {});
    const w = getWorkflow(ctx);
    expect(w).toBe(ctx.workflow);
    expect(Object.keys(w)).toEqual(['1']);
  });

  it('validateWorkflow returns valid for workflow with valid refs', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', { ckpt_name: 'x.safetensors' });
    addNode(ctx, 'CLIPTextEncode', { text: 'a cat' });
    connectNodes(ctx, '1', 1, '2', 'clip');
    const result = validateWorkflow(ctx);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateWorkflow returns invalid for dangling ref', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CLIPTextEncode', { text: 'x', clip: ['99', 0] });
    const result = validateWorkflow(ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"99"'))).toBe(true);
  });

  it('validateWorkflow returns invalid for negative output index', () => {
    const ctx = createWorkflow();
    addNode(ctx, 'CheckpointLoaderSimple', {});
    addNode(ctx, 'CLIPTextEncode', { text: 'x', clip: ['1', -1] });
    const result = validateWorkflow(ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid output index'))).toBe(true);
  });
});
