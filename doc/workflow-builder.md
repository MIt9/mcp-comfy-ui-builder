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

***

## Save / load

- **save_workflow(name, workflow)** — saves to `workflows/<name>.json` (relative to cwd). Name is sanitized (alphanumeric, dash, underscore).
- **list_saved_workflows** — lists names and paths in `workflows/`.
- **load_workflow(name_or_path)** — loads by name (e.g. `my_workflow` → `workflows/my_workflow.json`) or by full path. Returns workflow JSON for **execute_workflow** or **save_workflow**.

Flow: `build_workflow` → optional `save_workflow` → later `load_workflow` → `execute_workflow`.

***

## Execution (requires ComfyUI)

Set **COMFYUI_HOST** (default `http://localhost:8188`). Then:

1. **execute_workflow(workflow)** — POST workflow to ComfyUI; returns `prompt_id`.
2. **get_execution_status(prompt_id)** — GET history; returns status and image filenames/URLs.
3. **list_queue** — GET queue (running and pending).

See [MCP-SETUP.md](MCP-SETUP.md) and [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md).
