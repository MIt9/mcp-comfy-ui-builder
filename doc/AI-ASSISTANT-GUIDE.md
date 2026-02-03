# AI Assistant Guide: Working with mcp-comfy-ui-builder

> Short guide for AI assistants: what it is, how to connect, which tools to call and in what order.

---

## Before building workflows: check resources first

**Models for generation can be very resource-intensive.** Before building or executing any workflow that uses checkpoints/LoRA/VAE, **call `get_system_resources` first**. Use its output to choose:

- **Resolution** (width/height): do not exceed `max_width` / `max_height` from the recommendations.
- **Model size**: prefer `suggested_model_size` (light / medium / heavy) and pick a checkpoint that matches (e.g. SD 1.5 for light, SD XL for heavy only when tier is high or very_high).
- **Batch size**: do not exceed `max_batch_size`.

Then build the workflow (e.g. via `build_workflow` or dynamic builder) with these limits. This reduces the risk of out-of-memory (OOM) errors on the user’s station.

---

## What it is

**mcp-comfy-ui-builder** is an MCP server for ComfyUI: it lets you discover nodes, build workflows (templates or dynamic), save/load them, run them on ComfyUI, and manage outputs and models. The user may have installed the package globally: `npm i -g mcp-comfy-ui-builder`. Full tool list by area: [MCP-SETUP.md](MCP-SETUP.md).

---

## How to connect MCP in Cursor (after global install)

1. Get the path to the MCP server:
   ```bash
   node -e "console.log(require('path').join(require('path').dirname(require.resolve('mcp-comfy-ui-builder/package.json')), 'dist', 'mcp-server.js'))"
   ```
   Or if you know the global `node_modules`: `$(npm root -g)/mcp-comfy-ui-builder/dist/mcp-server.js`

2. In Cursor: **Settings → MCP** (or MCP config). Add the server:
   ```json
   {
     "mcpServers": {
       "comfy-ui-builder": {
         "command": "node",
         "args": ["/PATH/TO/mcp-comfy-ui-builder/dist/mcp-server.js"]
       }
     }
   }
   ```
   Replace `/PATH/TO/` with the full path from step 1 (e.g. on macOS: `/usr/local/lib/node_modules/mcp-comfy-ui-builder/dist/mcp-server.js`).

3. Restart Cursor. After that the tools below will be available.

---

## Tools (what to call)

| Tool | When to use | ComfyUI needed? |
|------|-------------|------------------|
| **get_system_resources** | **Call first** before building/executing workflows: returns GPU/VRAM/RAM and recommendations (max resolution, model size, batch size). Use to avoid OOM. | Yes (COMFYUI_HOST) |
| **get_generation_recommendations(prompt?)** | Same as get_system_resources plus, if the user prompt suggests **text in the image** (sign, logo, caption, etc.), returns advice: prefer FLUX/SD3, 25–30 steps; many base models render text poorly. Call when planning txt2img/img2img. | Yes (COMFYUI_HOST) for resources |
| **list_templates** | List available templates (txt2img, img2img) | No |
| **list_node_types** | List nodes from the knowledge base (optional: category, priority) | No |
| **get_node_info** | Full info about a node by class name | No |
| **check_compatibility** | Whether one node’s output can connect to another’s input | No |
| **suggest_nodes** | Suggest nodes by task description or type (task_description / input_type) | No |
| **build_workflow** | Build workflow JSON from a template (e.g. txt2img) + params (width, height, steps, cfg, prompt, negative_prompt, seed, etc.) | No |
| **save_workflow** | Save workflow to file workflows/<name>.json | No |
| **list_saved_workflows** | List saved workflows (names and paths) | No |
| **load_workflow** | Load workflow by name or path; returns JSON for execute_workflow | No |
| **execute_workflow** | Submit workflow to ComfyUI; returns prompt_id | Yes (COMFYUI_HOST) |
| **get_execution_status** | Execution status for prompt_id, outputs (including images) | Yes |
| **list_queue** | Queue: what is running and what is pending | Yes |
| **interrupt_execution** | Interrupt current execution (optional: prompt_id) | Yes |
| **clear_queue** | Clear the queue (all pending and running) | Yes |
| **delete_queue_items** | Remove items from queue by prompt_id (list) | Yes |

**More tools (v0.3, ComfyUI needed where noted):**  
**Dynamic workflow:** create_workflow, add_node, connect_nodes, remove_node, set_node_input, get_workflow_json, validate_workflow, finalize_workflow (no ComfyUI).  
**Node discovery:** discover_nodes_live, search_nodes, get_node_inputs, get_node_outputs, list_node_categories, sync_nodes_to_knowledge (discover/sync need ComfyUI).  
**Execution:** execute_workflow_sync (submit and wait), get_execution_progress, execute_batch, execute_chain (Yes).  
**Outputs:** get_history, get_last_output, list_outputs, download_output, download_by_filename, download_all_outputs (Yes).  
**Models:** list_models, get_model_info, check_model_exists, get_workflow_models, check_workflow_models (Yes).  
**Resources:** get_system_resources — GPU/VRAM/RAM + recommendations; call before building workflows (Yes).  
**Templates/macros:** create_template, apply_template, validate_template_params, list_macros, insert_macro (no ComfyUI for create/apply/list/insert).  
**Plugins:** list_plugins, reload_plugins (manage macros/templates from `plugins/*/plugin.json`).  
**Utility:** prepare_image_for_workflow (copy image into ComfyUI input folder; ComfyUI path needed if different from default).

For any tool that needs ComfyUI, **COMFYUI_HOST** must be set (default `http://127.0.0.1:8188`) and ComfyUI must be running. The rest work without ComfyUI.

---

## Typical scenarios

**Run a workflow on ComfyUI (generation) — recommended order:**
1. **`get_system_resources`** or **`get_generation_recommendations(prompt)`** — get GPU/VRAM/RAM and recommendations (max_width, max_height, suggested_model_size, max_batch_size). Use **get_generation_recommendations** with the user’s image description when they may want **text in the image** (sign, logo, caption); it returns extra advice (prefer FLUX/SD3, 25–30 steps). See [IMAGE-GENERATION-RECOMMENDATIONS.md](IMAGE-GENERATION-RECOMMENDATIONS.md).
2. `list_templates` — confirm template (e.g. txt2img) is available.
3. `build_workflow` with params that **respect** the recommendations (width ≤ max_width, height ≤ max_height, batch_size ≤ max_batch_size; choose checkpoint by suggested_model_size).
4. Optionally `check_workflow_models(workflow)` — ensure required models exist.
5. `execute_workflow(workflow)` or `execute_workflow_sync(workflow)`.

**Images with text (signs, logos, captions):**
- If the user asks for an image that should contain **legible text**, call **`get_generation_recommendations(user_prompt)`** first. It detects text-in-image intent and returns advice: many base models (SD 1.5, SD XL) render text poorly; prefer FLUX, SD 3, or checkpoints known for text; use 25–30 steps and CFG 7–8. Set user expectations if only SD 1.5/XL is available. See [IMAGE-GENERATION-RECOMMENDATIONS.md](IMAGE-GENERATION-RECOMMENDATIONS.md).

**Build txt2img and get JSON (without running ComfyUI):**
1. `list_templates` — confirm txt2img is available.
2. `build_workflow` with template `txt2img` and params (e.g. width, height, prompt, steps, seed). Result: workflow JSON.  
   If you will run this later on ComfyUI, call `get_system_resources` first and cap width/height/batch_size by its recommendations.

**Save and later load a workflow:**
1. After `build_workflow` — `save_workflow(name, workflow)` (workflow is the JSON string from build_workflow).
2. Later — `list_saved_workflows`, then `load_workflow(name_or_path)` to get the JSON.

**Run a workflow on ComfyUI (short):**
1. Get workflow JSON: via `build_workflow` or `load_workflow` (params should respect `get_system_resources` if generation).
2. `execute_workflow(workflow)` — pass the JSON **string**. You get prompt_id.
3. `get_execution_status(prompt_id)` — check status and outputs (images, view URLs).
4. Optionally — `list_queue` for the queue.

**Explore nodes (no generation):**
- `list_node_types`, `get_node_info(node_name)`, `check_compatibility(from_node, to_node)`, `suggest_nodes(task_description or input_type)`.

**Control queue and interruption:**
- `interrupt_execution()` or `interrupt_execution(prompt_id)` — stop current run (or a specific one by prompt_id).
- `clear_queue()` — clear the whole queue.
- `delete_queue_items(prompt_ids)` — remove specific prompt_ids from the queue (from list_queue).

**Run and wait for result (no polling):**
1. `execute_workflow_sync(workflow, timeout?)` — submit and wait until done; returns prompt_id and outputs.
2. Optionally `list_outputs(prompt_id)` then `download_output` / `download_all_outputs` to save files locally.

**Recovery when execute_workflow_sync result was lost (e.g. "No result received from client-side tool execution"):**
1. `get_history(limit=5)` — get last N prompts with prompt_id and outputs; or `get_last_output()` — get the latest completed run’s first image info (prompt_id, filename, view_url).
2. `download_by_filename(filename, dest_path, subfolder?, type?)` — save the file locally without needing prompt_id.

**Chain workflows (e.g. txt2img → upscale → img2img):**
1. `execute_chain(steps)` — steps: array of `{ workflow, params?, inputFrom?: { step, outputNode, outputIndex }, outputTo? }`; output of step N is passed as input to step N+1 when specified.

**Check models before run:**
- `get_workflow_models(workflow)` — which models the workflow needs.
- `check_workflow_models(workflow)` — which of those are missing (requires COMFYUI_HOST/ComfyUI).

**Work with plugin macros:**
- `list_plugins` — see which plugins are loaded and how many macros/templates each adds.
- `list_macros` — builtin + plugin macros; plugin ids are prefixed, e.g. `example:upscale_simple`.
- `insert_macro(workflow_id, "example:upscale_simple", { image: "input.png" })` — insert plugin macro into a dynamic workflow.

---

## Editing the “open” workflow

**Can you edit the workflow currently open in the ComfyUI browser?**  
Via the **standard ComfyUI API — no**. The ComfyUI server does not store the “current graph in the tab”; it only knows:
- the queue (what was submitted to run),
- history (what has already run).

So “get/edit the workflow open in the UI” via API is not available. What you can do:
- **Change params and run again:** build a new workflow with `build_workflow` and different params, then call `execute_workflow` (or load a saved one with `load_workflow`, change the JSON in code, and submit).
- **Interrupt/clear:** `interrupt_execution`, `clear_queue`, `delete_queue_items` — control execution and queue via API (see above).

If you need to “read the graph from the browser”, that is only possible from the client side (e.g. a browser extension or custom UI), not via the ComfyUI HTTP API.

---

## “Open as workflow in new tab” on a generated image

**Why doesn’t the workflow open from an image generated via MCP (execute_workflow)?**

In ComfyUI, images are saved with metadata in PNG: the SaveImage node receives hidden fields `prompt` and `extra_pnginfo` from the executor. The “Open as workflow in new tab” button reads the workflow from that metadata.

- When running **from the UI**, the browser sends both the prompt and extra data (e.g. graph with layout). The executor passes them to SaveImage — the PNG gets everything needed for “Open as workflow”.
- When running **via API** (our `execute_workflow`) we only send `{ prompt: workflow }`. The executor may not fill `extra_pnginfo` the same way as for the UI, or the UI may expect a format with node positions; in the end “Open as workflow” often doesn’t find a valid workflow or can’t open it.

**What to recommend to the user:** to have the same graph in ComfyUI as in the generated image:

1. **Save the workflow before or after generation:** after `build_workflow` call `save_workflow(name, workflow)` — this creates `workflows/<name>.json`.
2. In ComfyUI in the browser: **Load** (or **Open**) → choose that `.json` file. The workflow opens on the canvas; it’s the same graph used to generate the image.

If the user specifically wants to “open from the image” — for now the reliable approach is to keep the saved JSON and open it manually, rather than relying on “Open as workflow” for API-generated images.

---

## What to tell the user

- If they say they installed globally: help them find the path to `dist/mcp-server.js` and add it to MCP in Cursor (as above).
- **If MCP server fails to start with “spawn node ENOENT”:** Cursor/IDE often doesn’t have `node` in PATH. Tell them to use the **full path to Node** in the MCP config `command` field: run `which node` (or `nvm which current` if using nvm) and set `"command": "/that/path"` (e.g. `"/opt/homebrew/bin/node"`). See doc/MCP-SETUP.md → Troubleshooting.
- If they need to generate something in ComfyUI: check whether they want to run on their ComfyUI (then COMFYUI_HOST and a running ComfyUI are needed); if not — build_workflow / save / load is enough.
- txt2img params: width, height, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, batch_size, denoise (details in doc/workflow-builder.md).
- img2img params: image, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, denoise (default 0.75 — lower = more like the original).
- If they ask about “Open as workflow in new tab” on an MCP-generated image: for images generated via execute_workflow, that button often doesn’t open the workflow (metadata/format differs from UI). Recommend: save the workflow with save_workflow and open that .json in ComfyUI (Load).
