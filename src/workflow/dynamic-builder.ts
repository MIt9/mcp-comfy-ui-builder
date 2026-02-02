/**
 * Dynamic Workflow Builder: create and mutate ComfyUI workflows in memory.
 * Used with WorkflowStore for MCP tools create_workflow, add_node, connect_nodes, etc.
 */
import type { ComfyUIWorkflow, ComfyUINodeDef } from '../types/comfyui-api-types.js';

export interface WorkflowContext {
  id: string;
  workflow: ComfyUIWorkflow;
  nodeCounter: number;
  createdAt: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function generateWorkflowId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `wf_${t}${r}`;
}

/**
 * Create a new empty workflow context. Store it with WorkflowStore and use the returned id for MCP tools.
 */
export function createWorkflow(): WorkflowContext {
  return {
    id: generateWorkflowId(),
    workflow: {},
    nodeCounter: 0,
    createdAt: new Date(),
  };
}

/**
 * Add a node to the workflow. Returns the new node id (e.g. "1", "2").
 */
export function addNode(
  ctx: WorkflowContext,
  classType: string,
  inputs: Record<string, unknown> = {}
): string {
  ctx.nodeCounter += 1;
  const nodeId = String(ctx.nodeCounter);
  ctx.workflow[nodeId] = {
    class_type: classType,
    inputs: { ...inputs },
  };
  return nodeId;
}

/**
 * Connect an output of one node to an input of another.
 */
export function connectNodes(
  ctx: WorkflowContext,
  fromNodeId: string,
  outputIndex: number,
  toNodeId: string,
  inputName: string
): void {
  const toNode = ctx.workflow[toNodeId];
  if (!toNode) {
    throw new Error(`Node "${toNodeId}" not found`);
  }
  if (!ctx.workflow[fromNodeId]) {
    throw new Error(`Node "${fromNodeId}" not found`);
  }
  toNode.inputs[inputName] = [fromNodeId, outputIndex];
}

/**
 * Remove a node from the workflow. Does not remove references to it (validation will report dangling refs).
 */
export function removeNode(ctx: WorkflowContext, nodeId: string): void {
  const node = ctx.workflow[nodeId];
  if (!node) {
    throw new Error(`Node "${nodeId}" not found`);
  }
  delete ctx.workflow[nodeId];
}

/**
 * Set a literal input on a node (overwrites any existing link or value).
 */
export function setNodeInput(
  ctx: WorkflowContext,
  nodeId: string,
  inputName: string,
  value: unknown
): void {
  const node = ctx.workflow[nodeId];
  if (!node) {
    throw new Error(`Node "${nodeId}" not found`);
  }
  node.inputs[inputName] = value;
}

/**
 * Get the current workflow JSON (same reference; caller may not mutate if sharing).
 */
export function getWorkflow(ctx: WorkflowContext): ComfyUIWorkflow {
  return ctx.workflow;
}

/**
 * Validate workflow: all [nodeId, outputIndex] references point to existing nodes and valid output index.
 */
export function validateWorkflow(ctx: WorkflowContext): ValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set(Object.keys(ctx.workflow));

  for (const [nodeId, nodeDef] of Object.entries(ctx.workflow)) {
    const inputs = (nodeDef as ComfyUINodeDef).inputs ?? {};
    for (const [inputName, inputValue] of Object.entries(inputs)) {
      if (Array.isArray(inputValue) && inputValue.length === 2) {
        const [refNodeId, outputIndex] = inputValue;
        if (typeof refNodeId === 'string' && typeof outputIndex === 'number') {
          if (!nodeIds.has(refNodeId)) {
            errors.push(
              `Node "${nodeId}" input "${inputName}" references non-existent node "${refNodeId}"`
            );
          }
          if (outputIndex < 0) {
            errors.push(
              `Node "${nodeId}" input "${inputName}" has invalid output index ${outputIndex}`
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
