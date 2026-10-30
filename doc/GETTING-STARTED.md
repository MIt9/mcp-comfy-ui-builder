# 🚀 Getting Started - Node Discovery System

> Quick start and practical examples

***

## Requirements

- Node.js 22.12+

***

## Quick start (seed + MCP)

1. **Clone and install**

   ```bash
   git clone https://github.com/MIt9/mcp-comfy-ui-builder.git && cd mcp-comfy-ui-builder
   npm install
   ```

2. **Build** (postbuild fills knowledge from seed)

   ```bash
   npm run build
   npm run mcp
   ```

3. **Connect MCP** in Cursor or Claude Desktop — see [MCP-SETUP.md](MCP-SETUP.md).

4. **(Optional) Configure ComfyUI connection** for real-time execution:

   ```bash
   export COMFYUI_HOST="http://localhost:8188"
   ```

5. **Before generation:** AI assistants should call **`get_generation_recommendations`** first. Its `resources` and `recommendations` fields contain GPU/VRAM/RAM and recommendations (max resolution, model size, batch size). Use these to build workflows that avoid out-of-memory (OOM) on the station. See [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md).

***

## Real-Time Execution (v0.5.0+)

### WebSocket Support

The MCP server now supports **real-time progress tracking** via WebSocket with automatic fallback to polling.

**Benefits:**
- Sub-second progress updates (<100ms vs 1.5s polling)
- See exactly which node is executing
- 90% reduced network traffic
- Automatic fallback if WebSocket unavailable

### Example: Execute Workflow with Progress

Use `execute_workflow` with workflow JSON and `wait=true` (the default). Set `include_events=true` to receive `event_count` and the last 10 progress events alongside the result. The default `progress_transport="auto"` combines WebSocket updates with polling completion checks.

Use `wait=false` to return a `prompt_id` immediately, then inspect it with `get_execution(prompt_id, view="progress")`. Recorded outputs and image view URLs are available with `view="summary"`; exception details use `view="errors"`.

### Setup for Real-Time Features

1. **Start ComfyUI:**
   ```bash
   cd /path/to/ComfyUI
   python main.py --listen
   ```

2. **Set environment variable:**
   ```bash
   export COMFYUI_HOST="http://localhost:8188"
   ```

3. **Rebuild and restart MCP:**
   ```bash
   npm run build
   npm run mcp
   ```

4. **Test in Claude:**
   ```
   "Execute a simple workflow and show progress"
   ```

   With `include_events=true`, inspect `event_count` and `events` in the response. Polling completion can succeed even when no WebSocket events arrive.

### Available Tools

| Tool | Real-Time Support | Description |
|------|------------------|-------------|
| `execute_workflow` | ✅ Yes | Wait for results or queue immediately; choose transport and optional recent events |
| `execute_batch` | ✅ Yes | Optimized batch with shared WebSocket |
| `execute_chain` | ✅ Yes | Sequential workflows with progress per step |
| `get_execution` | ✅ Yes | Use view=progress for live state; summary/errors read recorded results |

See [WEBSOCKET-GUIDE.md](WEBSOCKET-GUIDE.md) for detailed usage.

***

## Commands

| Command | Description |
|---------|-------------|
| `npm run seed` | Fill knowledge from seed. Use `--force` to overwrite. |
| `npm run sync-manager` | Update custom packs list from ComfyUI-Manager (GitHub) |
| `npm run sync-nodes` | Sync nodes from running ComfyUI to knowledge base (requires COMFYUI_HOST). Add `--interval N` for daemon mode. |
| `npm run mcp` | Start MCP server (after `npm run build`). **Sync on startup:** if ComfyUI is available, new nodes are synced in background. |
| `npm test` | Run tests |

***

## Knowledge base and sync_nodes_to_knowledge

The tool `sync_nodes_to_knowledge` writes node definitions to the **knowledge/** directory (`base-nodes.json`, `node-compatibility.json`, `CHANGELOG.md`). By default the path is `process.cwd() + '/knowledge'`. If the MCP server is started from another app, the working directory may not be the package root, so the directory might be missing and you may see **ENOENT: base-nodes.json**.

- **Auto-creation:** The server creates the `knowledge/` directory if it does not exist (when the current directory is writable).
- **Custom path:** Set **COMFYUI_KNOWLEDGE_DIR** (or **MCP_COMFYUI_KNOWLEDGE_PATH**) to the full path of the knowledge directory (e.g. the package’s `knowledge/` folder). Then `sync_nodes_to_knowledge` will use that path regardless of the process working directory.

Example in MCP config:
```json
"env": {
  "COMFYUI_KNOWLEDGE_DIR": "/path/to/mcp-comfy-ui-builder/knowledge"
}
```

***

## Adding nodes

**Option A — Sync from ComfyUI** (when ComfyUI runs with custom nodes):
```bash
COMFYUI_HOST=http://127.0.0.1:8188 npm run sync-nodes
```
MCP also syncs on startup when ComfyUI is available.

**Option B — Manual:**
1. Add an object to `knowledge/base-nodes.json` → `nodes.NodeClassName` (see existing entries for structure).
2. Update `knowledge/node-compatibility.json` (producers/consumers for the node’s return types) if needed.

***

## Next steps

- **Task navigation**: [doc/README.md](README.md)
- **Quick reference**: [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
- **MCP**: [MCP-SETUP.md](MCP-SETUP.md)
- **Docker setup**: [DOCKER-SETUP.md](DOCKER-SETUP.md)

***

*Getting Started v2.3.1 - get_generation_recommendations, txt2img_flux, platform_hints, adaptive timeout* | *2026-02-03*
