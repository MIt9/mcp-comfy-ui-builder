# mcp-comfy-ui-builder

[![CI](https://github.com/MIt9/mcp-comfy-ui-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/MIt9/mcp-comfy-ui-builder/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-comfy-ui-builder.svg)](https://www.npmjs.com/package/mcp-comfy-ui-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ComfyUI Node Discovery** — seed knowledge base and MCP tools for Cursor/Claude.

## What is this

- Seed `knowledge/base-nodes.json` and `node-compatibility.json` from bundled seed (no external services)
- Sync custom packs list from ComfyUI-Manager (GitHub)
- MCP server with tools: `list_node_types`, `get_node_info`, `check_compatibility`, `suggest_nodes`; **Workflow Builder:** `list_templates`, `build_workflow`, `save_workflow`, `list_saved_workflows`, `load_workflow`, `execute_workflow`, `get_execution_status`, `list_queue` (require `COMFYUI_HOST` for execute/status/queue)

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
| `npm test` | Run tests (vitest) |
| `npm run mcp` | Start MCP server (after `npm run build`) |

## Documentation

Single entry point — **task-oriented navigation**:

- **[doc/README.md](doc/README.md)** — where to start, task-based navigation
- **[doc/INDEX.md](doc/INDEX.md)** — complete list of documents and links
- **[doc/QUICK-REFERENCE.md](doc/QUICK-REFERENCE.md)** — commands, examples, troubleshooting
- **[doc/GETTING-STARTED.md](doc/GETTING-STARTED.md)** — quick start
- **[doc/MCP-SETUP.md](doc/MCP-SETUP.md)** — connect MCP in Cursor/Claude
- **Architecture:** [doc/node-discovery-system.md](doc/node-discovery-system.md), [doc/IMPLEMENTATION-CHECKLIST.md](doc/IMPLEMENTATION-CHECKLIST.md)
- **Knowledge base:** [knowledge/README.md](knowledge/README.md), [doc/knowledge-base-usage-guide.md](doc/knowledge-base-usage-guide.md)
- **Workflow Builder:** [doc/workflow-builder.md](doc/workflow-builder.md) — templates, params, save/load, ComfyUI format
- **Planning:** [ROADMAP.md](ROADMAP.md), [NEXT-STEPS.md](NEXT-STEPS.md), [TODO.md](TODO.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Requirements

- Node.js 18+

## MCP Server (Cursor / Claude)

Server provides tools for AI:

- **list_node_types** — list nodes from knowledge base (optional filter by category/priority)
- **get_node_info(node_name)** — complete information about a node
- **check_compatibility(from_node, to_node)** — check output-to-input compatibility
- **suggest_nodes(task_description | input_type)** — suggest nodes by task or type

**Workflow Builder** (build, save, load, run ComfyUI workflows):

- **list_templates** — list available workflow template ids (e.g. txt2img)
- **build_workflow(template, params?)** — build workflow JSON from template (no ComfyUI needed)
- **save_workflow(name, workflow)** — save workflow to workflows/\<name\>.json
- **list_saved_workflows** — list saved workflows (names and paths)
- **load_workflow(name_or_path)** — load workflow JSON for execute or save
- **execute_workflow(workflow)** — submit workflow to ComfyUI; returns `prompt_id` (requires `COMFYUI_HOST`)
- **get_execution_status(prompt_id)** — get status and image outputs (requires `COMFYUI_HOST`)
- **list_queue** — list running and pending prompts (requires `COMFYUI_HOST`)

For execute/status/queue, set `COMFYUI_HOST` (default `http://localhost:8188`) or leave unset to use localhost; ensure ComfyUI is running. See [.env.example](.env.example).

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
