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

## Dynamic workflow (create_workflow, add_node, connect_nodes, …)

Build a workflow step by step instead of from a template:

1. **create_workflow** — returns `workflow_id` (e.g. `wf_xxx`).
2. **add_node**(workflow_id, class_type, inputs?) — returns node id (`"1"`, `"2"`, …). Use for literal inputs (ckpt_name, text, seed, etc.).
3. **connect_nodes**(workflow_id, from_node, output_idx, to_node, input_name) — connect output of one node to input of another (e.g. `"1"`, 1, `"2"`, `"clip"`).
4. **set_node_input**(workflow_id, node_id, input_name, value) — set or overwrite a literal input.
5. **remove_node**(workflow_id, node_id) — remove a node (validation will report dangling refs).
6. **get_workflow_json**(workflow_id) or **finalize_workflow**(workflow_id) — get workflow JSON for **execute_workflow** or **save_workflow**.
7. **validate_workflow**(workflow_id) — check that all node references exist.

Workflows expire after 30 minutes if not used. Example: create_workflow → add_node(CheckpointLoaderSimple) → add_node(CLIPTextEncode, {text: "a cat"}) → connect_nodes(…, "1", 1, "2", "clip") → … → get_workflow_json → execute_workflow.

***

## Save / load

- **save_workflow(name, workflow)** — saves to `workflows/<name>.json` (relative to cwd). Name is sanitized (alphanumeric, dash, underscore).
- **list_saved_workflows** — lists names and paths in `workflows/`.
- **load_workflow(name_or_path)** — loads by name (e.g. `my_workflow` → `workflows/my_workflow.json`) or by full path. Returns workflow JSON for **execute_workflow** or **save_workflow**.

Flow: `build_workflow` → optional `save_workflow` → later `load_workflow` → `execute_workflow`.

***

## Execution (requires ComfyUI)

Set **COMFYUI_HOST** (default `http://127.0.0.1:8188`). Then:

1. **execute_workflow(workflow)** — POST workflow to ComfyUI; returns `prompt_id`.
2. **get_execution_status(prompt_id)** — GET history; returns status and image filenames/URLs.
3. **list_queue** — GET queue (running and pending).

**Sync run (submit and wait):** **execute_workflow_sync(workflow, timeout?)** — submits and polls until done; returns prompt_id and outputs. **get_execution_progress(prompt_id)** — progress while running (e.g. current node). **execute_batch(workflows, concurrency?)** — run multiple workflows.

See [MCP-SETUP.md](MCP-SETUP.md) and [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md).

***

## Outputs (requires ComfyUI)

After execution:

- **get_history(limit?)** — get ComfyUI execution history without prompt_id (last N prompts with prompt_id, status, outputs). Use when execute_workflow_sync did not return prompt_id (e.g. WebSocket timeout).
- **get_last_output()** — get the most recent completed prompt’s first image (prompt_id, filename, view_url). Then use **download_by_filename** to save.
- **list_outputs(prompt_id)** — list output files (images, etc.) for a prompt.
- **download_output(prompt_id, node_id, filename, dest_path, subfolder?)** — save one file locally (requires prompt_id).
- **download_by_filename(filename, dest_path, subfolder?, type?)** — save an output file by filename (no prompt_id). Use when you have filename from get_history or get_last_output.
- **download_all_outputs(prompt_id, dest_dir, prefix_node_id?)** — save all outputs to a directory.

***

## Chaining (execute_chain)

Run a sequence of workflows where the output of step N is the input of step N+1:

- **execute_chain(steps)** — steps: array of `{ workflow, params?, inputFrom?: { step, outputNode, outputIndex }, outputTo? }`. Use **inputFrom** to take an output from a previous step and **outputTo** to pass it into the next workflow’s input. Requires **COMFYUI_HOST**.

Example: step 1 txt2img → step 2 upscale (image from step 1) → step 3 img2img (image from step 2).

***

## Models (requires ComfyUI)

- **get_workflow_models(workflow)** — list models required by a workflow (checkpoint, lora, vae, controlnet, upscale, etc.).
- **check_workflow_models(workflow)** — check which of those models are missing on the server.
- **list_models(model_type?)** — list available models by type. **get_model_info(name, model_type)**, **check_model_exists(name, model_type)** — single-model info/check.
