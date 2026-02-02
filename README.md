# mcp-comfy-ui-builder

[![CI](https://github.com/MIt9/mcp-comfy-ui-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/MIt9/mcp-comfy-ui-builder/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-comfy-ui-builder.svg)](https://www.npmjs.com/package/mcp-comfy-ui-builder)
[![Docker](https://img.shields.io/docker/v/siniidrozd/mcp-comfy-ui-builder?label=docker)](https://hub.docker.com/r/siniidrozd/mcp-comfy-ui-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ComfyUI Node Discovery** — seed knowledge base and MCP tools for Cursor/Claude.

## What is this

- Seed `knowledge/base-nodes.json` and `node-compatibility.json` from bundled seed (no external services)
- Sync custom packs list from ComfyUI-Manager; sync nodes from running ComfyUI (`sync-nodes` CLI or on MCP startup)
- MCP server with 50+ tools: node discovery, dynamic workflow builder, template system, **WebSocket real-time execution** (v0.5.0+), batch/chain execution, model management, plugin system
- **Real-time progress tracking:** Sub-second updates via WebSocket with automatic polling fallback
- **90% reduced network traffic** for batch execution with shared WebSocket connection

## Quick start

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

3. **Use knowledge in code**

   ```ts
   import baseNodes from './knowledge/base-nodes.json' assert { type: 'json' };
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm run seed` | Fill knowledge from seed. Use `--force` to overwrite. |
| `npm run sync-manager` | Update custom packs list from ComfyUI-Manager |
| `npm run sync-nodes` | Sync nodes from running ComfyUI to knowledge base (requires COMFYUI_HOST) |
| `npm test` | Run tests (vitest) |
| `npm run mcp` | Start MCP server (after `npm run build`) |

## Documentation

Single entry point — **task-oriented navigation**:

- **[doc/README.md](doc/README.md)** — where to start, task-based navigation
- **[doc/INDEX.md](doc/INDEX.md)** — complete list of documents and links
- **[doc/QUICK-REFERENCE.md](doc/QUICK-REFERENCE.md)** — commands, examples, troubleshooting
- **[doc/GETTING-STARTED.md](doc/GETTING-STARTED.md)** — quick start
- **[doc/MCP-SETUP.md](doc/MCP-SETUP.md)** — connect MCP in Cursor/Claude
- **[doc/DOCKER-SETUP.md](doc/DOCKER-SETUP.md)** — `docker pull siniidrozd/mcp-comfy-ui-builder:0.5.0` | docker-compose for MCP + ComfyUI
- **Knowledge base:** [knowledge/README.md](knowledge/README.md), [doc/knowledge-base-usage-guide.md](doc/knowledge-base-usage-guide.md)
- **Workflow Builder:** [doc/workflow-builder.md](doc/workflow-builder.md) — templates, params, save/load, ComfyUI format
- **Planning:** [ROADMAP.md](ROADMAP.md), [NEXT-STEPS.md](NEXT-STEPS.md), [TODO.md](TODO.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Requirements

- Node.js 18+

## MCP Server (Cursor / Claude)

Server provides 50+ tools across 9 categories:

### Core Features

**Node Discovery:**
- **list_node_types**, **get_node_info**, **check_compatibility**, **suggest_nodes**
- **discover_nodes_live**, **search_nodes**, **sync_nodes_to_knowledge**

**Dynamic Workflow Builder:**
- **create_workflow**, **add_node**, **connect_nodes**, **validate_workflow**
- Build workflows programmatically without JSON manipulation

**Templates & Macros:**
- **list_templates**, **build_workflow** — Pre-built templates (txt2img, img2img, inpainting, upscale, LoRA, ControlNet, batch)
- **create_template**, **apply_template** — Parameterized templates
- **list_macros**, **insert_macro** — Reusable sub-workflows

**Real-Time Execution (v0.5.0+) 📡:**
- **execute_workflow_sync** — Execute with **WebSocket progress streaming** (sub-second updates)
- **execute_workflow_stream** — Full event history collection (WebSocket-only)
- **get_execution_progress** — Real-time progress with node-level granularity
- **execute_batch** — Concurrent execution with **90% reduced network traffic**
- **execute_chain** — Sequential workflows with data passing

**Model Management:**
- **list_models**, **check_model_exists**, **get_workflow_models**
- Supports checkpoint, lora, vae, controlnet, upscale, embedding, clip

**Outputs & Queue:**
- **list_outputs**, **download_output**, **download_all_outputs**
- **list_queue**, **interrupt_execution**, **clear_queue**

**Plugins:**
- **list_plugins**, **reload_plugins** — Data-only plugin system

**Install (requires COMFYUI_PATH):**
- **install_custom_node**, **install_model** — Install nodes and models via ComfyUI-Manager

### WebSocket Features (v0.5.0+)

- **<100ms latency** for progress updates (vs 1.5s polling)
- **Node-level tracking:** See exactly which node is executing with progress percentage
- **Automatic fallback:** Gracefully falls back to polling if WebSocket unavailable
- **Shared connection:** Single WebSocket for batch/chain execution (90% reduced traffic)

Set `COMFYUI_HOST` environment variable for execution/model/output tools:
```bash
export COMFYUI_HOST="http://localhost:8188"
```

See [doc/MCP-SETUP.md](doc/MCP-SETUP.md) for full tool list and [doc/WEBSOCKET-GUIDE.md](doc/WEBSOCKET-GUIDE.md) for real-time features.

### Running MCP

From project root, first build the project, then start the server:

```bash
npm run build
npm run mcp
```

Or without npm: `node dist/mcp-server.js`. Server works via **stdio** (stdin/stdout). More details → [doc/MCP-SETUP.md](doc/MCP-SETUP.md).

### Connect in Cursor

Add server to MCP settings (Cursor Settings → MCP or config):

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

Replace `/ABSOLUTE/PATH/TO/mcp-comfy-ui-builder` with the full path to your project clone. Restart Cursor after config change.

### Publish on GitHub

1. Create a new repository on [GitHub](https://github.com/new): name `mcp-comfy-ui-builder`, visibility Public (or Private). Do **not** initialize with README, .gitignore, or license (project already has them).
2. Add remote and push:

   ```bash
   git remote add origin https://github.com/MIt9/mcp-comfy-ui-builder.git
   git branch -M main
   git push -u origin main
   ```

3. If you fork this repo, replace `MIt9` with your GitHub username in the URLs above.

### Connect in Claude Desktop

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS). Add the same `mcpServers` block and restart Claude.

## License

MIT
