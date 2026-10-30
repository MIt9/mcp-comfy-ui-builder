# MCP Server — ComfyUI

Connect this MCP server in Cursor or Claude Desktop to use its **40 tools**.

## Choosing tools

1. Call `get_generation_recommendations(prompt?, checkpoint?)` before generation. Inspect `recommendations.flux_ready`, resolution limits, and recommended timeout when resources are available.
2. Use `search_nodes(source="local|live|merged")` to find classes and `get_node_info(section="all|inputs|outputs")` to inspect them.
3. Build a preset with `build_workflow(template, params)`. Restyling uses `template="restyle"` with `image` and `style` in params.
4. Assemble manually with `create_workflow`, `add_node`, and `set_node_input`. An input takes either `value` or `connection={node_id, output_index}`. Validate references and export JSON before execution.
5. `execute_workflow(workflow)` waits for a result. Set `wait=false` to return a prompt id immediately. Inspect that run with `get_execution(view="summary|progress|errors")`.
6. Get files with `list_outputs(prompt_id)` and `download_outputs`. If the prompt id is unknown, use `get_history` or `list_outputs(selector="latest_image")`.

`execute_batch` handles independent workflows; `execute_chain` passes images between dependent steps. Custom template JSON uses `create_template` and `apply_template`; `list_templates` lists named presets instead.

## Tool catalog

There are no compatibility aliases. Parameters named `workflow` take ComfyUI API workflow **JSON strings** unless their schema explicitly permits another form. Live access defaults to `http://127.0.0.1:8188`; set `COMFYUI_HOST` for another address, and `COMFYUI_PATH` for installation and process restart. Local discovery, construction, template operations, and saved workflows work offline.

### Nodes — 5 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `search_nodes` | `source="local|live|merged"` (default merged), optional `query`, `task`, `category`, `priority`, `input_type`, `output_type`, `limit` (default 100), `offset` (default 0). Returns `{total, offset, nodes}` with source information. Local never contacts ComfyUI; live fails if unavailable. Priority uses local metadata. |
| `get_node_info` | `node_name`, `section="all|inputs|outputs"` (default all). Returns a normalized definition or selected ports, preferring live with local fallback. |
| `check_compatibility` | `from_node`, `to_node`. Checks compatible types using local knowledge. |
| `list_node_categories` | Lists unique live/local categories. |
| `sync_nodes_to_knowledge` | Adds previously unknown live nodes to local knowledge. Requires running ComfyUI. Startup also attempts a background sync. |

### Dynamic workflows — 6 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `create_workflow` | Creates an empty in-memory workflow and returns `workflow_id`. |
| `add_node` | `workflow_id`, `class_type`, optional `inputs`. Returns node id. |
| `set_node_input` | `workflow_id`, target `node_id`, `input_name`, exactly one of `value` or `connection={node_id, output_index}`. Overwrites a literal/link. Connections require both nodes to exist. |
| `remove_node` | `workflow_id`, `node_id`. Removes a node; references to it may become invalid. |
| `get_workflow_json` | `workflow_id`. Exports JSON without validating, saving, executing, or locking the context. |
| `validate_workflow` | `workflow_id`. Checks references and output indices. |

### Presets, templates, and macros — 6 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `list_templates` | Lists preset ids accepted by `build_workflow`. |
| `build_workflow` | `template`, optional `params`. Builds JSON without execution. Restyle params require `image` (ComfyUI input filename) and `style`; returns `{workflow, recipe}`. Other presets return workflow JSON directly. |
| `create_template` | `workflow`, `params` (definitions with node bindings), optional `name`, `description`, `category`. Returns custom template JSON without saving/registering it. |
| `apply_template` | `template` (custom JSON), `values`, optional `validate_only`. Validates then instantiates JSON; `validate_only=true` returns `{valid, errors}` only. |
| `list_macros` | Lists reusable sub-workflow blocks and input ports. |
| `insert_macro` | `workflow_id`, `macro_id`, `input_connections`. Inserts a block and returns node mappings/output ports. |

### Execution and history — 5 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `execute_workflow` | `workflow`, `wait` (default true), `include_events` (default false), optional `timeout_ms`, `progress_transport="auto|websocket|polling"` (default auto). Waits for completion or queues and returns a prompt id. Event collection returns a count and at most the last 10 events. |
| `get_execution` | `prompt_id`, `view="summary|progress|errors"` (default summary). Reads recorded outputs, current progress/queue status, or full exception details without submitting a new run. |
| `execute_batch` | `workflows` (JSON strings), optional `concurrency`, `stop_on_error`, `timeout_ms`. Runs independent workflows. |
| `execute_chain` | `steps`, optional `timeout_ms`, `stop_on_error`. Steps support JSON/saved names, node input overrides, `inputFrom`, and `outputTo`. |
| `get_history` | Optional `limit` (default 5, max 50). Lists recent recorded prompts and outputs. |

With `wait=false`, omit completion timeout, event collection, and a non-default transport. Event collection requires waiting and auto/WebSocket transport. Auto uses WebSocket with polling fallback; explicit WebSocket requires that connection. Polling does not collect WebSocket events. Omitted timeout uses the resource recommendation or 300000 ms.

### Outputs — 3 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `list_outputs` | Exactly one of `prompt_id` or `selector="latest_image"`. Returns `{prompt_id, files}`. Selector finds the newest history entry containing an image, then lists its outputs. |
| `download_outputs` | `source`, `destination`, optional `output_format="png|jpeg|webp"`, `convert_quality`. Retrieves one file to disk/base64 or all prompt outputs to a directory. Disk destinations may overwrite files. |
| `prepare_image_for_workflow` | `prompt_id`. Fetches the first output image and uploads it to ComfyUI input; returns its filename for LoadImage. |

Single-file download:

```json
{
  "source": {"kind": "file", "filename": "image.png", "prompt_id": "PROMPT_ID", "node_id": "9"},
  "destination": {"kind": "file", "path": "/absolute/path/result.webp"},
  "output_format": "webp"
}
```

A file source also accepts optional `subfolder` and `type="output|input|temp"`. Direct filename retrieval defaults to output storage. Providing `prompt_id` verifies ownership and resolves the actual storage type from history; an explicit type must match. `node_id` requires `prompt_id`.

For inline data, use `destination={"kind":"base64","max_bytes":819200}` without a path. Large images may be converted to WebP; `max_bytes=0` disables automatic conversion.

All files from one prompt:

```json
{
  "source": {"kind": "prompt", "prompt_id": "PROMPT_ID"},
  "destination": {"kind": "directory", "path": "/absolute/path/results", "prefix_node_id": true}
}
```

Prompt downloads require a directory destination and do not accept conversion options.

### Models and recommendations — 3 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `list_models` | Optional `type` and exact filename `name`. Returns `{found, models}`; empty models means no match. Types: checkpoint, lora, vae, controlnet, upscale, embedding, clip. Requires ComfyUI. |
| `get_workflow_models` | `workflow`, `check_availability` (default false). Extracts `required` offline; checking adds `ready`, `found`, `missing` and requires ComfyUI. |
| `get_generation_recommendations` | Optional `prompt`, `checkpoint`. Returns `resources`, `recommendations`, `warnings`, text-rendering advice, and a filename-based template suggestion. Offline resources/recommendations are null, with conservative fallback advice. Suggestions are heuristics, not architecture verification. |

### Queue and process control — 5 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `list_queue` | Lists running and pending prompts. |
| `interrupt_execution` | Optional `prompt_id`, `cleanup_after_ms`. Sends an interrupt and can subsequently remove the prompt from the queue. |
| `clear_queue` | Clears pending items; does not itself send an execution interrupt. |
| `delete_queue_items` | `prompt_ids`. Removes selected queue items. |
| `reload_comfyui` | Optional `wait_for_ready` (default true), `sync_after_restart`, `wait_timeout_ms`. Restarts ComfyUI and optionally syncs nodes. Requires COMFYUI_PATH and uses COMFYUI_HOST for its port. |

### Saved workflows — 3 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `save_workflow` | `name`, `workflow`. Saves JSON to `workflows/<name>.json`. |
| `list_saved_workflows` | Lists saved workflow names and paths. |
| `load_workflow` | `name_or_path`. Loads workflow JSON by name or path. |

### Plugins and installation — 4 tools

| Tool | Parameters and behavior |
|------|-------------------------|
| `list_plugins` | Lists loaded plugins and contributed macro/template counts. |
| `reload_plugins` | Reloads `plugins/*/plugin.json` and refreshes the macro registry. |
| `install_custom_node` | `node_names`, optional `channel`, `mode`. Installs packs through ComfyUI-Manager; restart to load them. Requires COMFYUI_PATH. |
| `install_model` | `url`, optional `model_type`. Downloads into a ComfyUI model directory. Requires COMFYUI_PATH. |

Knowledge data comes from `knowledge/base-nodes.json` and `knowledge/node-compatibility.json`. See [workflow-builder.md](workflow-builder.md) for workflow format and [PLUGINS.md](PLUGINS.md) for plugin structure.

***

## Quick connection — what you need

Use this checklist for the fastest setup.

### Must have

| Requirement | Description |
|-------------|-------------|
| **Node.js 22.12+** | Required to run the server. |
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

**With execution and ComfyUI (execute_workflow, get_execution, get_history, list_outputs, download_outputs, etc.):**
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

Live tools use `http://127.0.0.1:8188` when `COMFYUI_HOST` is omitted. Set it for another host or port. If that server is stopped, live requests report a connection error; local knowledge searches and workflow construction remain available. `COMFYUI_PYTHON` optionally selects the interpreter for restart/install; otherwise the installation's `.venv` or `venv` is used.

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

For desktop clients, put this variable in the MCP configuration's `env` block so the spawned server receives it.

### Verifying WebSocket Connection

After setting COMFYUI_HOST, test with:

```
User: "Submit a simple workflow with wait=false, then inspect its prompt_id with get_execution(view=progress)"

Check the get_execution response for:
- "method": "websocket" ← Real-time enabled ✅
- "method": "polling" ← History/queue fallback; cached WebSocket progress is unavailable
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
| **WebSocket not connecting** (method: "polling") | Check: 1) ComfyUI is running (`curl http://localhost:8188/system_stats`), 2) COMFYUI_HOST is set correctly, 3) WebSocket endpoint works (`wscat -c ws://localhost:8188/ws?clientId=test`). **Note:** Polling fallback is automatic and works fine. |

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

*MCP Setup — consolidated 40-tool API*
