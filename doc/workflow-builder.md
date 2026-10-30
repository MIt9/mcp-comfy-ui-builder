# Workflow Builder

> Build, save, load, and execute ComfyUI workflows via MCP (template → JSON → ComfyUI).

***

## ComfyUI workflow format

A workflow is a JSON object: **node id (string) → node definition**.

Each node has:

- **class_type** — ComfyUI node class (e.g. `CheckpointLoaderSimple`, `KSampler`)
- **inputs** — object: input name → value. Value can be:
  - literal (number, string, etc.)
  - link: `[nodeId, outputIndex]` (output of another node)

Example:

```json
{
  "1": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" }
  },
  "2": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "a cat", "clip": ["1", 1] }
  }
}
```

ComfyUI runs the graph: POST `/prompt` with body `{ "prompt": workflow }`. See [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md).

***

## Templates

Use **list_templates** to see available template ids. Use **build_workflow(template, params?)** to get workflow JSON.

### txt2img

Text-to-image: CheckpointLoaderSimple → CLIPTextEncode (positive + negative) → EmptyLatentImage → KSampler → VAEDecode → SaveImage.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| width | number | 1024 | Latent width |
| height | number | 1024 | Latent height |
| steps | number | 20 | Sampler steps |
| cfg | number | 8 | CFG scale |
| prompt | string | '' | Positive prompt |
| negative_prompt | string | '' | Negative prompt |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI | SaveImage prefix |
| batch_size | number | 1 | EmptyLatentImage batch |
| denoise | number | 1 | KSampler denoise |

Example: `build_workflow("txt2img", { width: 512, height: 768, prompt: "a cat", steps: 30 })`.

### txt2img_flux

FLUX text-to-image: CheckpointLoaderSimple → CLIPTextEncodeFlux (clip_l, t5xxl, guidance) → ModelSamplingFlux → EmptyLatentImage → KSampler (cfg=1) → VAEDecode → SaveImage. **Call get_generation_recommendations first** and inspect **recommendations.flux_ready** and the recommended FLUX resolution limits. Use ckpt_name like `flux1-dev-fp8.safetensors` or `flux1-schnell-fp8.safetensors`.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| width | number | 1024 | Latent width |
| height | number | 1024 | Latent height |
| steps | number | 28 | Sampler steps |
| prompt | string | '' | Used for both clip_l and t5xxl if clip_l/t5xxl not set |
| clip_l | string | '' | Short keywords (style, quality) |
| t5xxl | string | '' | Long description (scene, details) |
| negative_prompt | string | '' | Negative conditioning |
| guidance | number | 3.5 | CLIPTextEncodeFlux guidance |
| seed | number | 0 | Random seed |
| ckpt_name | string | flux1-dev-fp8.safetensors | FLUX checkpoint filename |
| filename_prefix | string | ComfyUI_flux | SaveImage prefix |
| batch_size | number | 1 | EmptyLatentImage batch |

Example arguments: `{ "template": "txt2img_flux", "params": { "prompt": "a crocodile toy", "width": 1024, "height": 1024 } }`. Pass `checkpoint` to **get_generation_recommendations** for a filename-based template suggestion; it is a heuristic, not architecture verification.

### img2img

Image-to-image: LoadImage → VAEEncode → CheckpointLoaderSimple → CLIPTextEncode (positive + negative) → KSampler → VAEDecode → SaveImage.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| image | string | input.png | Input image filename (in ComfyUI input folder) |
| steps | number | 20 | Sampler steps |
| cfg | number | 8 | CFG scale |
| prompt | string | '' | Positive prompt |
| negative_prompt | string | '' | Negative prompt |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI_img2img | SaveImage prefix |
| denoise | number | 0.75 | KSampler denoise (0.0-1.0, lower = more original) |

Example: `build_workflow("img2img", { image: "photo.png", prompt: "oil painting style", denoise: 0.6 })`.

### restyle

Image-to-image in a chosen style (cartoon, oil painting, anime, etc.). Same pipeline as img2img; **style** is mapped to a prompt (or use free text). Use **build_workflow** with `template="restyle"` and `params.image` / `params.style`. Returns `{ workflow, recipe }`; serialize the `workflow` field for execution or saving. Other named presets return workflow JSON directly.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| image | string | required | Input image filename (in ComfyUI input folder; upload first if needed) |
| style | string | — | Keyword: cartoon, oil_painting, anime, watercolor, sketch, comic, pixel_art, pastel, cyberpunk — or any free text used as prompt |
| prompt | string | — | Override prompt (if set, style keyword is ignored) |
| negative_prompt | string | '' | Negative prompt |
| denoise | number | 0.65 | Strength of style change (lower = closer to original) |
| steps | number | 20 | Sampler steps |
| cfg | number | 8 | CFG scale |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI_img2img | SaveImage prefix |

Example arguments: `{ "template": "restyle", "params": { "image": "photo.png", "style": "cartoon" } }`. The returned recipe records the prompt and parameters for regeneration.

### image_caption

Image-to-text (caption): LoadImage → BLIPCaption. **Requires a custom node pack** (e.g. [ComfyUI-Blip](https://github.com/1038lab/ComfyUI-Blip), comfyui-art-venture, or img2txt-comfyui-nodes). Use after **prepare_image_for_workflow(prompt_id)** to verify a generated image.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| image | string | input.png | Input image filename (e.g. from prepare_image_for_workflow) |

Example: `build_workflow("image_caption", { image: "ComfyUI_00001.png" })`. See [GENERATE-AND-VERIFY.md](GENERATE-AND-VERIFY.md).

### inpainting

Edit part of an image by mask: LoadImage + LoadImageMask → VAEEncode + SetLatentNoiseMask → CheckpointLoaderSimple → CLIPTextEncode → KSampler → VAEDecode → SaveImage.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| image | string | input.png | Input image filename |
| mask | string | mask.png | Mask filename (white = edit area) |
| prompt | string | '' | Positive prompt |
| negative_prompt | string | '' | Negative prompt |
| steps | number | 20 | Sampler steps |
| cfg | number | 7 | CFG scale |
| seed | number | 0 | Random seed |
| denoise | number | 0.85 | Edit strength |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI_inpaint | SaveImage prefix |

Example: `build_workflow("inpainting", { image: "photo.png", mask: "mask.png", prompt: "blue sky" })`.

### upscale

Upscale image: LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage. Optionally **refine** (upscale + KSampler denoise) for detail refinement.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| image | string | input.png | Input image filename |
| upscale_model | string | RealESRGAN_x4plus.pth | Upscale model filename |
| scale | number | 4 | Scale factor (informational) |
| refine | boolean | false | If true, add VAEEncode → KSampler → VAEDecode after upscale |
| denoise | number | 0.3 | Refinement denoise (when refine=true) |
| prompt | string | '' | Refinement prompt (when refine=true) |
| negative_prompt | string | '' | Refinement negative prompt |
| steps | number | 20 | Refinement steps |
| cfg | number | 7 | Refinement CFG |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint (when refine=true) |
| filename_prefix | string | ComfyUI_upscale | SaveImage prefix |

Example: `build_workflow("upscale", { image: "lowres.png" })` or `build_workflow("upscale", { image: "lowres.png", refine: true, prompt: "detailed" })`.

### txt2img_lora

Text-to-image with LoRA(s): CheckpointLoaderSimple → LoraLoader chain → CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| prompt | string | '' | Positive prompt |
| negative_prompt | string | '' | Negative prompt |
| loras | array | required | LoRA items: `[{ name, strength_model?, strength_clip? }]` |
| width | number | 1024 | Latent width |
| height | number | 1024 | Latent height |
| steps | number | 20 | Sampler steps |
| cfg | number | 7 | CFG scale |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI_lora | SaveImage prefix |
| batch_size | number | 1 | EmptyLatentImage batch |

Example: `build_workflow("txt2img_lora", { prompt: "a landscape", loras: [{ name: "detail.safetensors", strength_model: 0.8, strength_clip: 0.8 }] })`.

### controlnet

Structure-guided generation: LoadImage (control image) → ControlNetLoader → ApplyControlNet; CheckpointLoaderSimple → CLIPTextEncode → ApplyControlNet → KSampler → VAEDecode → SaveImage.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| control_image | string | control.png | Control image filename (e.g. Canny, depth, pose) |
| controlnet_name | string | control_v11p_sd15_canny.pth | ControlNet model filename |
| strength | number | 1 | Control strength (0.0–2.0) |
| prompt | string | '' | Positive prompt |
| negative_prompt | string | '' | Negative prompt |
| width | number | 1024 | Latent width |
| height | number | 1024 | Latent height |
| steps | number | 20 | Sampler steps |
| cfg | number | 7 | CFG scale |
| seed | number | 0 | Random seed |
| ckpt_name | string | sd_xl_base_1.0.safetensors | Checkpoint filename |
| filename_prefix | string | ComfyUI_controlnet | SaveImage prefix |

Example: `build_workflow("controlnet", { control_image: "canny.png", controlnet_name: "control_v11p_sd15_canny.pth", prompt: "a cat" })`.

### batch

Returns the **first** workflow from a batch of variations. Use **buildBatch** (exported from workflow-builder) to get an array of workflows; execute each separately.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| base_params | object | {} | Base txt2img params (width, height, prompt, etc.) |
| variations | array | [{ seed: 0 }] | Overrides per run: `[{ seed?, prompt? }, ...]` |
| batch_size | number | 1 | Not used in single workflow |

Example: `build_workflow("batch", { base_params: { width: 512, prompt: "x" }, variations: [{ seed: 1 }, { seed: 2, prompt: "y" }] })` returns the first variation. To get all: use **buildBatch** from the package.

***

## Dynamic workflow

Build a workflow step by step instead of from a template:

1. **create_workflow** — returns `workflow_id` (e.g. `wf_xxx`).
2. **add_node**(workflow_id, class_type, inputs?) — returns node id (`"1"`, `"2"`, …). Use for literal inputs (ckpt_name, text, seed, etc.).
3. **set_node_input** with `connection: { node_id, output_index }` — connect a source node's output to the target `node_id` / `input_name`.
4. **set_node_input** with `value` — set or overwrite a literal input. Provide exactly one of `value` or `connection`; node-reference tuples belong in `connection`, not `value`.
5. **remove_node**(workflow_id, node_id) — remove a node (validation will report dangling refs).
6. **get_workflow_json**(workflow_id) — get workflow JSON for **execute_workflow** or **save_workflow**.
7. **validate_workflow**(workflow_id) — check that all node references exist.

Dynamic contexts are in memory and subject to cleanup after the configured TTL (30 minutes by default). Example connection arguments:

```json
{
  "workflow_id": "wf_xxx",
  "node_id": "2",
  "input_name": "clip",
  "connection": { "node_id": "1", "output_index": 1 }
}
```

Flow: create_workflow → add_node → set_node_input → validate_workflow → get_workflow_json → execute_workflow.

## Custom parameterized templates

**create_template(workflow, params, ...)** returns custom template JSON without saving it or adding it to `list_templates`. Pass it to **apply_template** with `values` to validate and instantiate workflow JSON. Set `validate_only=true` to return `{ valid, errors }` without instantiation; invalid values prevent normal instantiation. These custom templates are separate from named presets accepted by `build_workflow`.

***

## Save / load

- **save_workflow(name, workflow)** — saves to `workflows/<name>.json` (relative to cwd). Name is sanitized (alphanumeric, dash, underscore).
- **list_saved_workflows** — lists names and paths in `workflows/`.
- **load_workflow(name_or_path)** — loads by name (e.g. `my_workflow` → `workflows/my_workflow.json`) or by full path. Returns workflow JSON for **execute_workflow** or **save_workflow**.

Flow: `build_workflow` → optional `save_workflow` → later `load_workflow` → `execute_workflow`.

***

## Execution (requires ComfyUI)

Set **COMFYUI_HOST**, for example `http://127.0.0.1:8188`, and keep ComfyUI running.

1. **execute_workflow** takes a workflow JSON string and waits for completion by default. Returns `prompt_id`, status, and outputs. Set `wait=false` to submit and return immediately.
2. **get_execution(prompt_id, view)** inspects an existing run. Use `view="summary"` (default) for recorded results and image URLs, `"progress"` for current progress / queue state, or `"errors"` for exception details and traceback.
3. **list_queue** lists running and pending prompts.

For execution, `progress_transport="auto"` (default) uses WebSocket with polling fallback; `"websocket"` requires WebSocket; `"polling"` uses history polling. Set `include_events=true` with `wait=true` and a non-polling transport to return the total event count and last 10 progress events. `timeout_ms` limits completion waiting; when omitted, resource recommendations determine the timeout, or 300000 ms is used if unavailable. With `wait=false`, omit timeout, event collection, and transport options.

**execute_batch(workflows, concurrency?)** waits for independent workflows. Use **execute_chain** for dependent steps.

See [MCP-SETUP.md](MCP-SETUP.md) and [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md).

***

## Outputs (requires ComfyUI)

After execution:

- **get_history(limit?)** — find recent prompt ids and outputs when a tool result was lost.
- **list_outputs** accepts exactly one of `prompt_id` or `selector="latest_image"`. The selector finds the newest history entry containing an image, then returns `{ prompt_id, files }` for that entry.
- **download_outputs** accepts typed `source` and `destination` objects. A single file can be saved to disk or returned as base64; all outputs of a prompt require a directory destination. Disk writes may overwrite files.

Single-file download arguments:

```json
{
  "source": { "kind": "file", "filename": "ComfyUI_00001.png", "type": "output", "prompt_id": "prompt-id", "node_id": "9" },
  "destination": { "kind": "file", "path": "/tmp/result.webp" },
  "output_format": "webp",
  "convert_quality": 85
}
```

`prompt_id` and `node_id` are optional for a known filename; `node_id` requires `prompt_id`. Supplying `prompt_id` verifies output ownership. Preserve `subfolder` from `list_outputs` when present. For inline data, use `destination: { "kind": "base64", "max_bytes": 819200 }`; large images can be converted to WebP. `max_bytes=0` disables automatic size-based conversion.

Download every output with `{ "source": { "kind": "prompt", "prompt_id": "prompt-id" }, "destination": { "kind": "directory", "path": "/tmp/results", "prefix_node_id": true } }`. Format conversion options apply only to single-file sources.

***

## Chaining (execute_chain)

Run a sequence of workflows where the output of step N is the input of step N+1:

- **execute_chain(steps)** — steps: array of `{ workflow, params?, inputFrom?: { step, outputNode, outputIndex }, outputTo? }`. Use **inputFrom** to take an output from a previous step and **outputTo** to pass it into the next workflow’s input. Requires **COMFYUI_HOST**.

Example: step 1 txt2img → step 2 upscale (image from step 1) → step 3 img2img (image from step 2).

***

## Models and generation recommendations

- **get_workflow_models(workflow, check_availability=false)** extracts dependencies offline and returns `required`. Set `check_availability=true` to also return `ready`, `found`, and `missing` using the running ComfyUI instance.
- **list_models(type?, name?)** lists models or searches an exact filename. Returns `{ found, models }`; supported types include checkpoint, lora, vae, controlnet, upscale, embedding, and clip. Requires ComfyUI.
- **get_generation_recommendations(prompt?, checkpoint?)** returns `resources`, nested `recommendations`, `warnings`, optional text-rendering advice, and a filename-based `template_suggestion`. Inspect `recommendations.max_width`, `max_height`, `max_batch_size`, `suggested_model_size`, and `flux_ready` before generation. If ComfyUI is unavailable, resources and recommendations may be null; follow the conservative advice in warnings.

## Node discovery

**search_nodes** supports `source="local"` for offline knowledge, `"live"` for installed-only nodes (fails without ComfyUI), and `"merged"` (default) for live-first merged results. Filter by `query`, `task`, `category`, `priority`, `input_type`, or `output_type`; paginate with `limit` and `offset`. It returns `{ total, offset, nodes }`.

Use **get_node_info(node_name, section="all")** for a normalized definition, `section="inputs"` for required/optional input definitions including enum choices, or `section="outputs"` for output types and names. Results identify the source. **check_compatibility**, **list_node_categories**, and **sync_nodes_to_knowledge** remain separate tools; sync writes newly discovered definitions to the knowledge base.
