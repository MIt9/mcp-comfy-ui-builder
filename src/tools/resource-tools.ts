import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as comfyui from '../comfyui-client.js';
import { ModelManager } from '../model-manager.js';
import { analyzeSystemResources } from '../resource-analyzer.js';
import { listOutputs, downloadByFilename, downloadAllOutputs } from '../output-manager.js';
import type { ComfyUIWorkflow } from '../types/comfyui-api-types.js';

const reply = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const fail = (error: unknown) => ({ ...reply({ error: error instanceof Error ? error.message : String(error) }), isError: true });
const modelType = z.enum(['checkpoint', 'lora', 'vae', 'controlnet', 'upscale', 'embedding', 'clip']);
const fileSource = z.object({
  kind: z.literal('file'),
  filename: z.string().min(1).describe('Filename returned by list_outputs or get_history'),
  subfolder: z.string().optional(),
  type: z.enum(['output', 'input', 'temp']).optional().describe('Storage type; resolved from prompt metadata when verifying ownership, otherwise defaults to output'),
  prompt_id: z.string().optional().describe('When provided, verify this file belongs to the prompt'),
  node_id: z.string().optional().describe('Optional output node filter; requires prompt_id'),
}).strict().refine((v) => !v.node_id || !!v.prompt_id, 'node_id requires prompt_id');
const allSource = z.object({ kind: z.literal('prompt'), prompt_id: z.string().min(1) }).strict();
const diskDestination = z.object({ kind: z.literal('file'), path: z.string().min(1) }).strict();
const directoryDestination = z.object({ kind: z.literal('directory'), path: z.string().min(1), prefix_node_id: z.boolean().default(true) }).strict();
const base64Destination = z.object({ kind: z.literal('base64'), max_bytes: z.number().int().min(0).optional() }).strict();

export function registerResourceTools(server: McpServer, modelManager: ModelManager) {
  server.registerTool('list_models', {
    description: 'List available models, or find an exact filename with name. Returns models and found; an empty list means no match. Requires COMFYUI_HOST. Use get_workflow_models to inspect workflow dependencies.',
    inputSchema: { type: modelType.optional().describe('Model category; omit to search all categories'), name: z.string().optional().describe('Exact model filename') },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ type, name }) => {
    try {
      if (!comfyui.isComfyUIConfigured()) throw new Error('Set COMFYUI_HOST to list models.');
      const models = (await modelManager.listModels(type)).filter((model) => name === undefined || model.name === name);
      return reply({ found: models.length > 0, models });
    } catch (error) { return fail(error); }
  });

  server.registerTool('get_workflow_models', {
    description: 'Extract model dependencies from workflow JSON. With check_availability=true, also return ready, found, and missing by querying ComfyUI; otherwise works offline.',
    inputSchema: { workflow: z.string().describe('ComfyUI API workflow JSON'), check_availability: z.boolean().default(false).describe('Check required models on COMFYUI_HOST') },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ workflow, check_availability }) => {
    try {
      const parsed = JSON.parse(workflow) as ComfyUIWorkflow;
      const required = modelManager.getWorkflowModels(parsed);
      if (!check_availability) return reply({ required });
      if (!comfyui.isComfyUIConfigured()) throw new Error('Set COMFYUI_HOST to check availability.');
      return reply({ required, ...await modelManager.checkWorkflowModels(parsed) });
    } catch (error) { return fail(error); }
  });

  server.registerTool('get_generation_recommendations', {
    description: 'Plan image generation: inspect GPU/VRAM/RAM and return resource recommendations, warnings, and optional text-rendering advice. Call before building or running workflows. checkpoint adds a filename-based template suggestion, not model compatibility verification. Without ComfyUI, returns conservative advice and resources=null.',
    inputSchema: { prompt: z.string().optional().describe('Image description; used to detect text-rendering needs'), checkpoint: z.string().optional().describe('Checkpoint filename for a heuristic preset suggestion') },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ prompt, checkpoint }) => {
    let resources: Awaited<ReturnType<typeof comfyui.getSystemStats>> | null = null;
    let recommendations: ReturnType<typeof analyzeSystemResources> | null = null;
    const warnings: string[] = [];
    try {
      if (!comfyui.isComfyUIConfigured()) throw new Error('ComfyUI not configured');
      resources = await comfyui.getSystemStats();
      recommendations = analyzeSystemResources(resources);
      warnings.push(...recommendations.warnings);
    } catch (error) { warnings.push(`${error instanceof Error ? error.message : String(error)}; use conservative defaults: 512x512, light model, batch 1.`); }
    const textAdvice = prompt && /\b(text|words|letters|lettering|sign|logo|caption|label|written|quote|billboard|inscription|headline)\b|that says|that reads/i.test(prompt)
      ? 'Base SD 1.5/SDXL models may render text poorly. Consider a text-capable model compatible with the available resources; verify the result.' : null;
    return reply({ resources, recommendations, warnings, text_in_image_advice: textAdvice,
      template_suggestion: checkpoint ? { template: /flux/i.test(checkpoint) ? 'txt2img_flux' : 'txt2img', checkpoint, heuristic: true, reason: 'Inferred from filename only; verify model architecture and installed nodes.' } : null });
  });

  server.registerTool('list_outputs', {
    description: 'List files for a known prompt, or use selector=latest_image to find the newest history entry containing an image and list its outputs. Returns prompt_id and files; does not download. Requires COMFYUI_HOST.',
    inputSchema: z.object({ prompt_id: z.string().min(1).optional().describe('Known execution id'), selector: z.literal('latest_image').optional().describe('Use when prompt id is unknown') }).strict().refine((v) => Number(!!v.prompt_id) + Number(!!v.selector) === 1, 'Provide exactly one of prompt_id or selector'),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ prompt_id, selector }) => {
    try {
      if (!comfyui.isComfyUIConfigured()) throw new Error('Set COMFYUI_HOST to list outputs.');
      if (selector) {
        const entry = (await comfyui.getHistory()).find((entry) => comfyui.getFirstOutputImageRef([entry]));
        prompt_id = entry?.prompt_id;
        if (!prompt_id) return reply({ prompt_id: null, files: [] });
      }
      return reply({ prompt_id, files: await listOutputs(prompt_id!) });
    } catch (error) { return fail(error); }
  });

  server.registerTool('download_outputs', {
    description: 'Retrieve one file (optionally verify prompt ownership) to disk or base64, or all outputs of a prompt into a directory. source.kind=file requires destination.kind=file/base64; source.kind=prompt requires directory. Single images support format conversion. Requires COMFYUI_HOST; disk destinations may overwrite files.',
    inputSchema: z.object({
      source: z.union([fileSource, allSource]).describe('Single file or every output of a prompt'),
      destination: z.union([diskDestination, directoryDestination, base64Destination]).describe('Disk file, directory, or inline base64'),
      output_format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Convert a single image'),
      convert_quality: z.number().int().min(1).max(100).optional().describe('JPEG/WebP quality, default 85'),
    }).strict().superRefine((v, ctx) => {
      if ((v.source.kind === 'prompt') !== (v.destination.kind === 'directory')) ctx.addIssue({ code: 'custom', message: 'Prompt source requires directory destination; file source requires file or base64 destination.' });
      if (v.source.kind === 'prompt' && (v.output_format || v.convert_quality !== undefined)) ctx.addIssue({ code: 'custom', message: 'Conversion options apply only to single files.' });
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ source, destination, output_format, convert_quality }) => {
    try {
      if (!comfyui.isComfyUIConfigured()) throw new Error('Set COMFYUI_HOST to download outputs.');
      if (source.kind === 'prompt' && destination.kind === 'directory') {
        return reply({ paths: await downloadAllOutputs(source.prompt_id, destination.path, { prefixNodeId: destination.prefix_node_id }) });
      }
      if (source.kind !== 'file' || destination.kind === 'directory') throw new Error('Invalid source/destination combination');
      let subfolder = source.subfolder;
      let storageType = source.type ?? 'output';
      if (source.prompt_id) {
        const file = (await listOutputs(source.prompt_id)).find((file) => file.filename === source.filename && (!source.node_id || file.node_id === source.node_id) && (subfolder === undefined || file.subfolder === subfolder));
        if (!file) throw new Error('No matching output belongs to this prompt.');
        subfolder = file.subfolder;
        storageType = z.enum(['output', 'input', 'temp']).parse(new URL(file.url).searchParams.get('type') ?? 'output');
        if (source.type && source.type !== storageType) throw new Error('Storage type does not match the prompt output.');
      }
      return reply(await downloadByFilename(source.filename, destination.kind === 'file' ? destination.path : '', {
        subfolder, type: storageType, returnBase64: destination.kind === 'base64',
        max_base64_bytes: destination.kind === 'base64' ? destination.max_bytes : undefined,
        output_format, convert_quality,
      }));
    } catch (error) { return fail(error); }
  });
}
