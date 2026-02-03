# MCP Server — ComfyUI Node Discovery

> How to connect the MCP server in Cursor and Claude Desktop

***

## What the server provides

Tools are grouped by area. **COMFYUI_HOST** is required for execution/queue/output/model tools (default `http://127.0.0.1:8188`). **COMFYUI_PATH** is required for install tools (see [INSTALL-NODES-AND-MODELS.md](INSTALL-NODES-AND-MODELS.md)).

### Knowledge & node discovery (no ComfyUI)

| Tool | Description |
|------|------|
| **list_node_types** | List nodes from knowledge (optional: category, priority) |
| **get_node_info(node_name)** | Full information about a node from base-nodes.json |
| **check_compatibility(from_node, to_node)** | Whether output of one node can be connected to input of another |
| **suggest_nodes(task_description \| input_type)** | Node suggestions by task description or output type |
| **discover_nodes_live** | Fetch all node definitions from running ComfyUI (object_info) |
| **search_nodes(query, category?)** | Search nodes by name/category (knowledge + live cache) |
| **get_node_inputs(node_name)** | Required/optional inputs for a node |
| **get_node_outputs(node_name)** | Output types and names for a node |
| **list_node_categories** | List all node categories (from live or knowledge) |
| **sync_nodes_to_knowledge** | Write live object_info into knowledge base. Also: MCP syncs on startup (background) when ComfyUI is available; CLI `npm run sync-nodes` for one-shot or daemon. |

### Dynamic workflow builder (no ComfyUI)

| Tool | Description |
|------|------|
| **create_workflow** | Create empty dynamic workflow; returns workflow_id (e.g. wf_xxx) |
| **add_node(workflow_id, class_type, inputs?)** | Add node to dynamic workflow; returns node id |
| **connect_nodes(workflow_id, from_node, output_idx, to_node, input_name)** | Connect two nodes |
| **remove_node(workflow_id, node_id)** | Remove node from dynamic workflow |
| **set_node_input(workflow_id, node_id, input_name, value)** | Set literal input on node |
| **get_workflow_json(workflow_id)** | Get workflow JSON for execute_workflow or save_workflow |
| **validate_workflow(workflow_id)** | Validate dynamic workflow (refs exist) |
| **finalize_workflow(workflow_id)** | Get workflow JSON (same as get_workflow_json) |

### Templates & build (no ComfyUI)

| Tool | Description |
|------|------|
| **list_templates** | List workflow template ids (e.g. txt2img, img2img, inpainting) |
| **build_workflow(template, params?)** | Build ComfyUI workflow JSON from template |
| **create_template(workflow, params_def)** | Create a parameterized template from a workflow |
| **apply_template(template, values)** | Apply parameter values to a template; returns workflow JSON |
| **validate_template_params(template, values)** | Check that values satisfy template parameters |
| **list_macros** | List available macros (e.g. upscale_refine) |
| **insert_macro(workflow_id, macro_id, input_connections)** | Insert a macro into a dynamic workflow |

### Execution (COMFYUI_HOST) 📡 WebSocket-enhanced (v0.5.0+)

| Tool | Description | Real-Time |
|------|------|-----------|
| **execute_workflow(workflow)** | Submit workflow to ComfyUI; returns prompt_id | N/A |
| **execute_workflow_sync(workflow, timeout?, stream_progress?)** | Submit and wait until done; returns prompt_id, outputs, and progress log. Always returns prompt_id (even on error) so you can use get_history/get_last_output if the result was lost (e.g. client-side timeout). | ✅ WebSocket + polling fallback |
| **execute_workflow_stream(workflow, timeout?)** | Execute with full event history (requires WebSocket) | ✅ WebSocket required |
| **get_execution_status(prompt_id)** | Status and image outputs for a prompt | N/A |
| **get_execution_progress(prompt_id)** | Progress info (current node, progress %, queue position) | ✅ WebSocket + polling fallback |
| **execute_batch(workflows, concurrency?)** | Run multiple workflows with optimized shared WebSocket | ✅ Pre-connects WebSocket |
| **execute_chain(steps)** | Run workflow chain with data passing (output N → input N+1) | ✅ Pre-connects WebSocket |

**WebSocket Features:**
- **Sub-second updates:** <100ms latency (vs 1.5s polling)
- **Node-level tracking:** See exactly which node is executing
- **Progress percentage:** Real-time progress (0-100%)
- **90% reduced traffic:** Single connection vs multiple HTTP requests
- **Auto-fallback:** Gracefully falls back to polling if WebSocket unavailable

### Outputs (COMFYUI_HOST)

| Tool | Description |
|------|------|
| **get_history(limit?)** | Get ComfyUI execution history (GET /history) without prompt_id. Returns last N prompts with prompt_id, status, outputs. Use when execute_workflow_sync did not return prompt_id (e.g. WebSocket timeout) to find the latest run. |
| **get_last_output()** | Get info for the most recent completed prompt output (first image). Returns prompt_id, filename, subfolder, view_url. Use when prompt_id was lost; then use download_by_filename to save the file. |
| **list_outputs(prompt_id)** | List output files (images, etc.) for a prompt |
| **download_output(prompt_id, node_id, filename, dest_path)** | Download a single output file (requires prompt_id) |
| **download_by_filename(filename, dest_path, subfolder?, type?)** | Download an output file by filename (no prompt_id). Use when you have filename from get_history or get_last_output. |
| **download_all_outputs(prompt_id, dest_dir)** | Download all outputs for a prompt to a directory |

### Resources & model management (COMFYUI_HOST)

| Tool | Description |
|------|------|
| **get_system_resources** | Get station GPU/VRAM/RAM and recommendations (max_width, max_height, suggested_model_size, max_batch_size). **Call first** before building or executing workflows to avoid OOM. |
| **get_generation_recommendations(prompt?)** | Same as get_system_resources plus, if the user prompt suggests **text in the image** (sign, logo, caption), returns advice: prefer FLUX/SD3, 25–30 steps; many base models render text poorly. See [IMAGE-GENERATION-RECOMMENDATIONS.md](IMAGE-GENERATION-RECOMMENDATIONS.md). |
| **list_models(model_type?)** | List models (checkpoint, lora, vae, controlnet, upscale, etc.) |
| **get_model_info(name, model_type)** | Details for a model |
| **check_model_exists(name, model_type)** | Whether the model is present |
| **get_workflow_models(workflow)** | Models required by a workflow |
| **check_workflow_models(workflow)** | Check which required models are missing |

### Queue & control (COMFYUI_HOST)

| Tool | Description |
|------|------|
| **list_queue** | List running and pending prompts |
| **interrupt_execution(prompt_id?)** | Stop current run or specific prompt |
| **clear_queue** | Clear all pending and running |
| **delete_queue_items(prompt_ids)** | Remove items from queue by prompt_id |

### Save / load (no ComfyUI)

| Tool | Description |
|------|------|
| **save_workflow(name, workflow)** | Save workflow to workflows/\<name\>.json; returns path |
| **list_saved_workflows** | List saved workflows (names and paths) from workflows/ |
| **load_workflow(name_or_path)** | Load workflow by name or path; returns JSON for execute_workflow |

### Utility

| Tool | Description |
|------|------|
| **prepare_image_for_workflow(image_path, dest_name?)** | Copy image into ComfyUI input folder; returns filename for workflow |

### Plugins (no ComfyUI)

| Tool | Description |
|------|------|
| **list_plugins** | List loaded plugins from `plugins/*/plugin.json` (id, name, version, macros/templates counts) |
| **reload_plugins** | Reload plugins from `plugins/*/plugin.json` and refresh macro registry |

### Install (COMFYUI_PATH)

| Tool | Description |
|------|------|
| **install_custom_node(node_names, channel?, mode?)** | Install custom node packs via ComfyUI-Manager cm-cli |
| **install_model(url, model_type?)** | Download model/LoRA/VAE by URL to ComfyUI models folder |

Data is loaded from `knowledge/base-nodes.json` and `knowledge/node-compatibility.json` at server startup. See [workflow-builder.md](workflow-builder.md) for templates and workflow format and [PLUGINS.md](PLUGINS.md) for plugin structure.

***

## Quick connection — what you need

Use this checklist for the fastest setup.

### Must have

| Requirement | Description |
|-------------|-------------|
| **Node.js 18+** | Required to run the server. |
| **Build once** | From project root: `npm install && npm run build`. Creates `dist/mcp-server.js` and fills `knowledge/` from seed. |
| **Absolute path** | In Cursor/Claude config you must pass the **full path** to `dist/mcp-server.js` (e.g. `/home/user/mcp-comfy-ui-builder/dist/mcp-server.js`). Relative paths or paths without `dist/mcp-server.js` will not work. |
| **Restart after config change** | After editing MCP config, fully restart Cursor or quit and reopen Claude Desktop. |

### Optional (by use case)

| Use case | Variable | When to set |
|----------|----------|-------------|
| **Execute workflows, queue, outputs, models** | `COMFYUI_HOST` | When you want to run workflows, get status, list queue, list models. Example: `http://127.0.0.1:8188`. |
| **Install custom nodes / models** | `COMFYUI_PATH` | When you use `install_custom_node` or `install_model`. Path to ComfyUI directory. ComfyUI-Manager must be in `custom_nodes`; Python env must have `pip install rich`. See [INSTALL-NODES-AND-MODELS.md](INSTALL-NODES-AND-MODELS.md). |
| **sync_nodes_to_knowledge from another app cwd** | `COMFYUI_KNOWLEDGE_DIR` | When MCP is started by another app and working directory is not the package root. Set to full path of the package `knowledge/` folder to avoid ENOENT. See [GETTING-STARTED.md](GETTING-STARTED.md#knowledge-base-and-sync_nodes_to_knowledge). |

### Quick connection checklist

1. **Clone and build** (from project root):
   ```bash
   git clone https://github.com/MIt9/mcp-comfy-ui-builder.git && cd mcp-comfy-ui-builder
   npm install && npm run build
   ```
2. **Get path to server** (replace with your actual path):
   ```bash
   # Linux/macOS — substitute your username and path
   echo "$(pwd)/dist/mcp-server.js"
   ```
3. **Add MCP server** in Cursor (Settings → MCP) or Claude Desktop config — see [Connecting in Cursor](#connecting-in-cursor) and [Connecting in Claude Desktop](#connecting-in-claude-desktop) below.
4. **Restart** Cursor or Claude Desktop.
5. **(Optional)** For execution/outputs: set `COMFYUI_HOST` in the same config (e.g. in `env` block).

If something doesn’t work, see [Troubleshooting](#troubleshooting).

***

## Starting the server

**If installed globally** (`npm i -g mcp-comfy-ui-builder`): use the path to the installed package. Get it with:
```bash
node -e "const p=require('path'); console.log(p.join(p.dirname(require.resolve('mcp-comfy-ui-builder/package.json')), 'dist', 'mcp-server.js'))"
```
Use that path in Cursor MCP config (see below). See also [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) for a short guide for AI assistants.

**From project root** (build first):
```bash
npm run build
npm run mcp
```
Alternative: `node dist/mcp-server.js`. Server uses **stdio** (stdin/stdout).

***

## Connecting in Cursor

1. Open MCP settings (Cursor Settings → MCP or the config file where MCP servers are defined).
2. Add the server. **Replace the path** with your absolute path to `dist/mcp-server.js`:

**Minimal (knowledge and workflow tools only):**
```json
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-comfy-ui-builder/dist/mcp-server.js"]
    }
  }
}
```

**With execution and ComfyUI (execute_workflow, get_execution_status, get_history, get_last_output, list_outputs, download_by_filename, etc.):**
```json
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-comfy-ui-builder/dist/mcp-server.js"],
      "env": {
        "COMFYUI_HOST": "http://127.0.0.1:8188"
      }
    }
  }
}
```

3. **Restart Cursor** (fully quit and reopen) so it picks up the new config.

Without `COMFYUI_HOST`, tools that need ComfyUI (execute_workflow, get_execution_status, get_history, get_last_output, list_outputs, download_by_filename, list_models, list_queue, sync_nodes_to_knowledge from live ComfyUI, etc.) will report that ComfyUI is not configured. With `COMFYUI_HOST` set, those tools work if ComfyUI is running at that URL.

***

## Connecting in Claude Desktop

1. **Config file:**
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - Create the file if it doesn't exist.
2. Add the same `mcpServers` block as for Cursor (see above): **absolute path** to `dist/mcp-server.js`, and optionally `env` with `COMFYUI_HOST` for execution/outputs.
3. **Restart Claude Desktop** (fully quit the application, not just close the window).

***

## Verification

After connecting, make sure Cursor/Claude sees the tools (e.g., in the MCP tools list). You can ask: "List ComfyUI node types with category loaders" or "Get info for KSampler" — AI will call the corresponding tools.

***

## WebSocket Configuration (v0.5.0+)

For real-time execution tracking, set **COMFYUI_HOST** environment variable:

```bash
export COMFYUI_HOST="http://localhost:8188"
```

Or in `.env` file:
```env
COMFYUI_HOST=http://localhost:8188
```

### Verifying WebSocket Connection

After setting COMFYUI_HOST, test with:

```
User: "Execute a simple workflow and show me progress"

Check response for:
- "progress_method": "websocket" ← Real-time enabled ✅
- "progress_method": "polling" ← Fallback mode (check COMFYUI_HOST)
```

### Docker Setup

When running in Docker, use service names:

```yaml
# docker-compose.yml
services:
  comfyui:
    ports:
      - "8188:8188"

  mcp-server:
    environment:
      - COMFYUI_HOST=http://comfyui:8188  # Use service name
```

See [WEBSOCKET-GUIDE.md](WEBSOCKET-GUIDE.md) for advanced usage.

***

## Troubleshooting

| Problem | What to check |
|----------|----------------|
| **spawn node ENOENT** / **Server fails to start** (Cursor/IDE) | The app may not have `node` in its PATH. Use the **full path to Node** in `command` instead of `"node"`. In terminal run `which node` (or `nvm which current` if using nvm) and put that path in config, e.g. `"command": "/opt/homebrew/bin/node"` or `"/usr/local/bin/node"`. See [Command: full path to node](#command-full-path-to-node) below. |
| **MCP doesn't see tools** | Path in `args` must be **absolute** to `dist/mcp-server.js`. After changing config — fully restart Cursor/Claude. |
| **Server doesn't start** (build/run) | Run `npm run build` from project root. Make sure there's a `knowledge/` folder (created by build from seed) with `base-nodes.json` and `node-compatibility.json`. |
| **Empty node list** | File `knowledge/base-nodes.json` must contain `nodes` object. Run `npm run seed` or add nodes manually. |
| **"ComfyUI is not configured"** | Set `COMFYUI_HOST` in the MCP server config (`env` block). Example: `"COMFYUI_HOST": "http://127.0.0.1:8188"`. ComfyUI must be running at that URL. |
| **ENOENT base-nodes.json / sync_nodes_to_knowledge** | MCP may be started from another app with a different working directory. Set `COMFYUI_KNOWLEDGE_DIR` to the full path of the package `knowledge/` folder, or run MCP from the package root. See [GETTING-STARTED.md](GETTING-STARTED.md#knowledge-base-and-sync_nodes_to_knowledge). |
| **install_custom_node fails (ModuleNotFoundError: rich)** | ComfyUI-Manager cm-cli needs Python package `rich`. Run `pip install rich` in the same Python environment used by ComfyUI. See [INSTALL-NODES-AND-MODELS.md](INSTALL-NODES-AND-MODELS.md). |
| **WebSocket not connecting** (progress_method: "polling") | Check: 1) ComfyUI is running (`curl http://localhost:8188/system_stats`), 2) COMFYUI_HOST is set correctly, 3) WebSocket endpoint works (`wscat -c ws://localhost:8188/ws?clientId=test`). **Note:** Polling fallback is automatic and works fine. |

### Command: full path to node

When Cursor (or another IDE) starts the MCP server, it spawns a process with `command` + `args`. The IDE often does **not** inherit your shell PATH (e.g. if you use nvm or Homebrew). So `"command": "node"` can fail with **spawn node ENOENT** (node not found).

**Fix:** set `command` to the **full path** to the Node executable:

- In terminal: `which node` → e.g. `/opt/homebrew/bin/node` or `/usr/local/bin/node`
- With nvm: `nvm which current` → e.g. `/Users/you/.nvm/versions/node/v20.x.x/bin/node`

Example config:

```json
"comfy-ui-builder": {
  "command": "/opt/homebrew/bin/node",
  "args": ["/usr/local/lib/node_modules/mcp-comfy-ui-builder/dist/mcp-server.js"]
}
```

Replace the path in `command` with your `which node` result; keep `args` as the absolute path to `dist/mcp-server.js`.

**Examples:** [examples/cursor-mcp-full-template.json](../examples/cursor-mcp-full-template.json) (full template — three placeholders, copy and replace), [examples/cursor-mcp.json](../examples/cursor-mcp.json) (minimal + COMFYUI_HOST), [examples/cursor-mcp-full.json](../examples/cursor-mcp-full.json) (full config with short placeholders). See [examples/README.md](../examples/README.md) for what to replace and an example after replacement.

***

*MCP Setup v2.1.0 - get_history, get_last_output, download_by_filename, get_generation_recommendations* | *2026-02-03*
