# AI Assistant Guide: Working with mcp-comfy-ui-builder

> Short guide for AI assistants: what it is, how to connect, which tools to call and in what order.

---

## Before building workflows: check resources first

**Models for generation can be very resource-intensive.** Before building or executing any workflow that uses checkpoints/LoRA/VAE, **call `get_generation_recommendations` first**. Pass the user's image description as `prompt` and, when known, the checkpoint filename as `checkpoint`. Use its nested `recommendations` object to choose:

- **Resolution** (width/height): do not exceed `recommendations.max_width` / `recommendations.max_height`.
- **Model size**: use `recommendations.suggested_model_size` (light / medium / heavy) and pick a checkpoint that matches the reported resource tier.
- **Batch size**: do not exceed `recommendations.max_batch_size`.

Then build the workflow (e.g. via `build_workflow` or dynamic builder) with these limits. This reduces the risk of out-of-memory (OOM) errors on the user’s station.

The result contains `resources`, `recommendations`, `warnings`, `text_in_image_advice`, and `template_suggestion`. If ComfyUI is unavailable, resources/recommendations can be null; use conservative settings from warnings. Checkpoint suggestions are filename heuristics, not verification of model architecture or installed nodes.

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

For execution, add `"env": { "COMFYUI_HOST": "http://127.0.0.1:8188" }` inside the server configuration. Use the host/port of the user's running ComfyUI instance.

---

## Tools (what to call)

| Tool | When to use | ComfyUI needed? |
|------|-------------|------------------|
| **get_generation_recommendations(prompt?, checkpoint?)** | **Call first** for GPU/VRAM/RAM, nested resource recommendations, optional text-rendering advice and checkpoint-based preset suggestion. | For resource stats; conservative advice works offline |
| **list_templates** | List available templates (txt2img, img2img) | No |
| **search_nodes** | Search/browse with source `local`, `live`, or `merged`; filter by query, task, category, priority, input/output type; paginate with limit/offset. | For live; local works offline |
| **get_node_info(node_name, section?)** | Normalized node definition (`all`, default), required/optional input definitions (`inputs`), or output types/names (`outputs`). | Live-first with local fallback |
| **check_compatibility** | Whether one node’s output can connect to another’s input | No |
| **build_workflow** | Build workflow JSON from a template (e.g. txt2img) + params (width, height, steps, cfg, prompt, negative_prompt, seed, etc.) | No |
| **save_workflow** | Save workflow to file workflows/<name>.json | No |
| **list_saved_workflows** | List saved workflows (names and paths) | No |
| **load_workflow** | Load workflow by name or path; returns JSON for execute_workflow | No |
| **execute_workflow** | Submit and wait by default; `wait=false` queues and returns immediately. Optional timeout, progress transport, and recent event collection. | Yes (COMFYUI_HOST) |
| **get_execution(prompt_id, view?)** | Inspect `summary` (default), live `progress`, or detailed `errors` without submitting a new run. | Yes |
| **list_queue** | Queue: what is running and what is pending | Yes |
| **interrupt_execution** | Interrupt current execution (optional: prompt_id) | Yes |
| **clear_queue** | Clear pending queue items; use interrupt_execution separately to stop a running job. | Yes |
| **delete_queue_items** | Remove items from queue by prompt_id (list) | Yes |

Other tools by area:

- **Dynamic workflow:** create_workflow, add_node, remove_node, set_node_input, get_workflow_json, validate_workflow (offline). `set_node_input` requires exactly one of `value` or `connection: { node_id, output_index }`.
- **Node discovery:** list_node_categories and sync_nodes_to_knowledge; sync requires ComfyUI and writes new definitions to the local knowledge base.
- **Execution:** execute_batch for independent workflows, execute_chain for dependent steps (ComfyUI).
- **Outputs:** get_history, list_outputs, download_outputs (ComfyUI).
- **Models:** list_models(type?, name?) and get_workflow_models(workflow, check_availability?) (availability checks require ComfyUI).
- **Templates/macros:** create_template, apply_template, list_macros, insert_macro (offline). `apply_template(validate_only=true)` checks values without instantiating.
- **Plugins:** list_plugins, reload_plugins (manage macros/templates from `plugins/*/plugin.json`).
- **Utility:** prepare_image_for_workflow copies a completed run's first output image into ComfyUI's input folder via HTTP (requires COMFYUI_HOST).
- **Installation:** install_custom_node and install_model require COMFYUI_PATH; reload_comfyui restarts ComfyUI after installation.

For tools that access ComfyUI over HTTP/WebSocket, set **COMFYUI_HOST**, for example `http://127.0.0.1:8188`, and keep ComfyUI running. Local construction and knowledge-base operations can work offline.

---

## Typical scenarios

**Run a workflow on ComfyUI (generation) — recommended order:**
1. **`get_generation_recommendations`** with `prompt` and optional `checkpoint` — inspect `resources`, `recommendations`, `warnings`, and any text-rendering advice. Use `recommendations.flux_ready` and FLUX resolution limits before choosing that preset.
2. `list_templates` — confirm template (e.g. txt2img) is available.
3. `build_workflow` with params that **respect** the nested recommendations (width ≤ recommendations.max_width, height ≤ recommendations.max_height, batch_size ≤ recommendations.max_batch_size).
4. Optionally `get_workflow_models` with `check_availability=true` — ensure required models exist.
5. `execute_workflow` with the workflow JSON string — waits by default and returns the final result.

**Images with text (signs, logos, captions):**
- Pass the description as `prompt` to **get_generation_recommendations**. Inspect `text_in_image_advice`; select a text-capable model compatible with available resources and verify the output. Model names alone do not guarantee readable text.

**Build txt2img and get JSON (without running ComfyUI):**
1. `list_templates` — confirm txt2img is available.
2. `build_workflow` with template `txt2img` and params (e.g. width, height, prompt, steps, seed). Result: workflow JSON.  
   If you will run this later on ComfyUI, call `get_generation_recommendations` first and cap width/height/batch_size by its nested recommendations.

**Save and later load a workflow:**
1. After `build_workflow` — `save_workflow(name, workflow)` (workflow is the JSON string from build_workflow).
2. Later — `list_saved_workflows`, then `load_workflow(name_or_path)` to get the JSON.

**Run a workflow on ComfyUI (short):**
1. Get workflow JSON via `build_workflow` or `load_workflow`. For `template="restyle"`, serialize the returned `workflow` field; keep the `recipe` for regeneration.
2. `execute_workflow` — pass the JSON **string** and `wait=false` if you need an immediate prompt_id.
3. `get_execution` with `view="progress"` while running, `view="summary"` for recorded outputs, or `view="errors"` for traceback details.
4. Optionally — `list_queue` for the queue.

**Explore nodes (no generation):**
- `search_nodes` with `source="local"` searches offline; `source="live"` inventories installed nodes and fails if ComfyUI is unavailable; the default `"merged"` prefers live definitions and falls back to local knowledge.
- `query` searches names/descriptions/categories, `task` also searches local use cases, and `input_type` / `output_type` distinguish consumed and produced ports. Results contain `{ total, offset, nodes }`.
- For enum options such as `sampler_name` / `scheduler`, call `get_node_info` with `section="inputs"`. `section="outputs"` returns output types/names; `"all"` returns the normalized definition. `check_compatibility` checks a pair of node classes using local knowledge.

**Control queue and interruption:**
- `interrupt_execution()` or `interrupt_execution(prompt_id)` — stop current run (or a specific one by prompt_id).
- `clear_queue()` — clear pending queue items; stopping a running job requires interruption.
- `delete_queue_items(prompt_ids)` — remove specific prompt_ids from the queue (from list_queue).

**Run and wait for a result:**
1. `execute_workflow` defaults to `wait=true`, with optional `timeout_ms`. `progress_transport="auto"` uses WebSocket with polling fallback; `"websocket"` requires WebSocket; `"polling"` uses history only. `include_events=true` returns the total count and last 10 events and requires a non-polling transport.
2. `list_outputs` with `prompt_id`, then `download_outputs` to retrieve files. With `wait=false`, omit timeout, event collection, and explicit transport options.

**Recovery when an execution result was lost:**
1. `get_history` with `limit=5` finds recent prompt ids; or `list_outputs` with `selector="latest_image"` finds the newest history entry containing an image and lists its files. Supply exactly one of selector or prompt_id.
2. `download_outputs` uses typed source/destination objects. Preserve any subfolder from the listed file.

```json
{
  "source": { "kind": "file", "filename": "ComfyUI_00001.png", "type": "output" },
  "destination": { "kind": "file", "path": "/tmp/result.png" }
}
```

Optionally add `prompt_id` and `node_id` to a file source to verify ownership (`node_id` requires prompt_id). Use `destination: { "kind": "base64", "max_bytes": 819200 }` for inline data. For all outputs, use `source: { "kind": "prompt", "prompt_id": "..." }` with `destination: { "kind": "directory", "path": "/tmp/results", "prefix_node_id": true }`. `output_format` and `convert_quality` apply only to single-file downloads. Disk destinations may overwrite files.

**Chain workflows (e.g. txt2img → upscale → img2img):**
1. `execute_chain(steps)` — steps: array of `{ workflow, params?, inputFrom?: { step, outputNode, outputIndex }, outputTo? }`; output of step N is passed as input to step N+1 when specified.

**Check models before run:**
- `get_workflow_models` returns `required` dependencies offline. Set `check_availability=true` to also get `ready`, `found`, and `missing` (requires ComfyUI).
- `list_models` accepts optional `type` and exact `name`, returning `{ found, models }` for listing, lookup, and existence checks.

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
2. The saved file contains the API graph, without canvas layout. Import it using a ComfyUI version or extension that supports API-format workflows; standard canvas workflow JSON is a different format.

If the user specifically wants to “open from the image” — for now the reliable approach is to keep the saved JSON and open it manually, rather than relying on “Open as workflow” for API-generated images.

---

## What to tell the user

- If they say they installed globally: help them find the path to `dist/mcp-server.js` and add it to MCP in Cursor (as above).
- **If MCP server fails to start with “spawn node ENOENT”:** Cursor/IDE often doesn’t have `node` in PATH. Tell them to use the **full path to Node** in the MCP config `command` field: run `which node` (or `nvm which current` if using nvm) and set `"command": "/that/path"` (e.g. `"/opt/homebrew/bin/node"`). See doc/MCP-SETUP.md → Troubleshooting.
- If they need to generate something in ComfyUI: check whether they want to run on their ComfyUI (then COMFYUI_HOST and a running ComfyUI are needed); if not — build_workflow / save / load is enough.
- txt2img params: width, height, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, batch_size, denoise (details in doc/workflow-builder.md).
- img2img params: image, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, denoise (default 0.75 — lower = more like the original).
- If they ask about “Open as workflow in new tab” on an MCP-generated image: metadata/format can differ from UI-generated files. Save the API graph with save_workflow; importing it as a canvas requires API-format workflow support.
