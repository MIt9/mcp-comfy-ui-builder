import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as comfyui from '../comfyui-client.js';
import { analyzeSystemResources } from '../resource-analyzer.js';
import { buildFromTemplate, buildRestyleWithRecipe, STYLE_PROMPTS } from '../workflow/workflow-builder.js';
import { connectNodes, setNodeInput } from '../workflow/dynamic-builder.js';
import { getWorkflowStore, type WorkflowStore } from '../workflow/workflow-store.js';
import { applyTemplate, validateTemplateParams, type WorkflowTemplate } from '../workflow/workflow-template.js';

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const restyleParamsSchema = z.object({
  image: z.string().min(1),
  style: z.string().min(1),
  prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
  denoise: z.number().min(0).max(1).optional(),
  steps: z.number().int().min(1).optional(),
  cfg: z.number().optional(),
  seed: z.number().int().optional(),
  ckpt_name: z.string().optional(),
  filename_prefix: z.string().optional(),
}).strict();

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.string(), z.unknown())]);

export const setNodeInputSchema = z.object({
  workflow_id: z.string().describe('Dynamic workflow id from create_workflow'),
  node_id: z.string().describe('Target node id'),
  input_name: z.string().describe('Target input name'),
  value: literalSchema.optional().describe('Literal input value; mutually exclusive with connection'),
  connection: z.object({
    node_id: z.string().describe('Source node id in the same workflow'),
    output_index: z.number().int().min(0).describe('Source output index, usually 0'),
  }).strict().optional().describe('Link to another node; mutually exclusive with value'),
}).strict().superRefine((args, ctx) => {
  if ((args.value !== undefined) === (args.connection !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Provide exactly one of value or connection' });
  }
  if (Array.isArray(args.value) && args.value.length === 2 && typeof args.value[0] === 'string' && typeof args.value[1] === 'number') {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Use connection for a node reference' });
  }
});

interface WorkflowToolOptions {
  store?: WorkflowStore;
  isComfyUIConfigured?: typeof comfyui.isComfyUIConfigured;
  getSystemStats?: typeof comfyui.getSystemStats;
}

export function registerWorkflowTools(server: McpServer, options: WorkflowToolOptions = {}): void {
  const store = options.store ?? getWorkflowStore();
  const configured = options.isComfyUIConfigured ?? comfyui.isComfyUIConfigured;
  const getStats = options.getSystemStats ?? comfyui.getSystemStats;

  server.registerTool('build_workflow', {
    description: 'Build workflow JSON from a named preset in list_templates without executing it. For restyle, pass image and style in params; returns {workflow, recipe}. Other presets return workflow JSON directly. Check get_generation_recommendations before FLUX. Use create_workflow for manual assembly or apply_template for custom template JSON.',
    inputSchema: {
      template: z.string().describe('Preset id, e.g. txt2img, txt2img_flux, or restyle'),
      params: z.record(z.string(), z.unknown()).optional().describe(`Preset parameters: prompt, width, height, steps, cfg, seed, ckpt_name, etc. For restyle: required image (ComfyUI input filename), style (${Object.keys(STYLE_PROMPTS).join(', ')} or free text); optional prompt, denoise, negative_prompt.`),
    },
  }, async ({ template, params = {} }) => {
    try {
      if (template === 'txt2img_flux' && configured()) {
        const rec = analyzeSystemResources(await getStats());
        if (!rec.flux_ready) {
          return textResult({ error: 'Insufficient resources for FLUX; approximately 12GB+ VRAM is required.', flux_ready: false, vram_total_gb: rec.vram_total_gb, suggestion: 'Use get_generation_recommendations and choose txt2img when flux_ready is false.', ...(rec.platform_hints?.length ? { platform_hints: rec.platform_hints } : {}) }, true);
        }
        const width = typeof params.width === 'number' ? params.width : 1024;
        const height = typeof params.height === 'number' ? params.height : 1024;
        if (rec.flux_max_width > 0 && rec.flux_max_height > 0 && (width > rec.flux_max_width || height > rec.flux_max_height)) {
          return textResult({ error: `FLUX resolution ${width}×${height} exceeds recommended ${rec.flux_max_width}×${rec.flux_max_height} for this GPU.`, flux_max_width: rec.flux_max_width, flux_max_height: rec.flux_max_height }, true);
        }
      }
      if (template === 'restyle') {
        const parsed = restyleParamsSchema.safeParse(params);
        if (!parsed.success) return textResult({ error: 'Invalid restyle parameters', issues: parsed.error.issues }, true);
        return textResult(buildRestyleWithRecipe(parsed.data));
      }
      return textResult(buildFromTemplate(template, params));
    } catch (error) {
      return textResult(`build_workflow failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  });

  server.registerTool('set_node_input', {
    description: 'Set one input in a dynamic workflow to a literal value or a connection to another node. Provide exactly one of value or connection; overwrites the previous value/link. Connections verify both source and target nodes exist.',
    inputSchema: setNodeInputSchema,
  }, (args) => {
    try {
      const ctx = store.get(args.workflow_id);
      if (!ctx) return textResult(`Workflow "${args.workflow_id}" not found or expired.`, true);
      if (args.connection) connectNodes(ctx, args.connection.node_id, args.connection.output_index, args.node_id, args.input_name);
      else setNodeInput(ctx, args.node_id, args.input_name, args.value);
      return textResult('ok');
    } catch (error) {
      return textResult(`set_node_input failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  });

  server.registerTool('apply_template', {
    description: 'Validate parameter values for custom template JSON from create_template, then instantiate workflow JSON. Set validate_only=true to return {valid, errors} without instantiating. Does not save or execute. Use build_workflow for named presets.',
    inputSchema: {
      template: z.string().describe('Custom template JSON from create_template'),
      values: z.record(z.string(), z.unknown()).describe('Parameter values keyed by name'),
      validate_only: z.boolean().optional().describe('Return validation results only (default false)'),
    },
  }, ({ template: json, values, validate_only = false }) => {
    try {
      const template = JSON.parse(json) as WorkflowTemplate;
      const validation = validateTemplateParams(template, values);
      if (validate_only) return textResult(validation);
      if (!validation.valid) return textResult(validation, true);
      return textResult(applyTemplate(template, values));
    } catch (error) {
      return textResult(`apply_template failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  });
}
