/**
 * Parameterized workflow templates: define parameters bound to node inputs,
 * apply values to produce a concrete workflow.
 */
import type { ComfyUIWorkflow, ComfyUINodeDef } from '../types/comfyui-api-types.js';

export interface ParameterBinding {
  nodeId: string;
  inputName: string;
}

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array';
  required: boolean;
  default?: unknown;
  options?: unknown[];
  description?: string;
  nodeBindings: ParameterBinding[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: ParameterDefinition[];
  workflow: ComfyUIWorkflow;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

function generateTemplateId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `tpl_${t}${r}`;
}

/**
 * Deep clone a workflow (nodes and their inputs; [nodeId, outputIndex] refs preserved).
 */
function cloneWorkflow(workflow: ComfyUIWorkflow): ComfyUIWorkflow {
  const out: ComfyUIWorkflow = {};
  for (const [nodeId, node] of Object.entries(workflow)) {
    const def = node as ComfyUINodeDef;
    out[nodeId] = {
      class_type: def.class_type,
      inputs: { ...def.inputs },
    };
  }
  return out;
}

/**
 * Create a parameterized template from a workflow and parameter definitions.
 * The workflow is stored by reference; applyTemplate clones it when applying.
 */
export function createTemplate(
  workflow: ComfyUIWorkflow,
  params: ParameterDefinition[],
  options?: { id?: string; name?: string; description?: string; category?: string }
): WorkflowTemplate {
  const id = options?.id ?? generateTemplateId();
  const name = options?.name ?? 'Custom template';
  const description = options?.description ?? '';
  const category = options?.category ?? 'custom';
  return {
    id,
    name,
    description,
    category,
    parameters: params,
    workflow,
  };
}

/**
 * Apply parameter values to a template. Returns a new workflow (clone) with bound inputs set.
 */
export function applyTemplate(
  template: WorkflowTemplate,
  values: Record<string, unknown>
): ComfyUIWorkflow {
  const workflow = cloneWorkflow(template.workflow);
  for (const param of template.parameters) {
    const value = values[param.name];
    const effective = value !== undefined && value !== null ? value : param.default;
    if (effective === undefined && param.required) continue;
    if (effective === undefined) continue;
    for (const { nodeId, inputName } of param.nodeBindings) {
      const node = workflow[nodeId];
      if (node) {
        node.inputs[inputName] = effective;
      }
    }
  }
  return workflow;
}

/**
 * Validate effective values, including defaults used during application.
 */
export function validateTemplateParams(
  template: WorkflowTemplate,
  values: Record<string, unknown>
): TemplateValidationResult {
  const errors: string[] = [];
  for (const param of template.parameters) {
    const value = values[param.name] ?? param.default;
    if (value === undefined || value === null) {
      if (param.required) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
      continue;
    }
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') errors.push(`Parameter "${param.name}" must be a string`);
        break;
      case 'number':
        if (typeof value !== 'number') errors.push(`Parameter "${param.name}" must be a number`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`Parameter "${param.name}" must be a boolean`);
        break;
      case 'select':
        if (param.options?.length && !param.options.includes(value)) {
          errors.push(`Parameter "${param.name}" must be one of: ${param.options.join(', ')}`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) errors.push(`Parameter "${param.name}" must be an array`);
        break;
      default:
        break;
    }
  }
  return { valid: errors.length === 0, errors };
}
