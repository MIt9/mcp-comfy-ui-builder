# mcp-comfy-ui-builder

**ComfyUI Node Discovery** — scan nodes from ComfyUI, generate descriptions via Claude, update knowledge base, and provide MCP tools for Cursor/Claude.

## What is this

- Connect to ComfyUI API (`/object_info`) and ComfyUI-Manager (custom-node-list)
- Detect new nodes, generate structured descriptions via Anthropic Claude
- Update `knowledge/base-nodes.json`, `custom-nodes.json`, `node-compatibility.json`
- MCP server with tools: `list_node_types`, `get_node_info`, `check_compatibility`, `suggest_nodes`

## Quick start

1. **Clone and install dependencies**

   ```bash
   git clone <repo-url> && cd mcp-comfy-ui-builder
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env: ANTHROPIC_API_KEY, COMFYUI_HOST (default: http://127.0.0.1:8188)
   ```

3. **Verify build**

   ```bash
   npm run build
   # or run without build:
   npm run dev -- --help
   ```

4. **Read knowledge base from code**

   Knowledge base is located in `knowledge/` at project root. Example:

   ```ts
   import baseNodes from './knowledge/base-nodes.json' assert { type: 'json' };
   ```

## Commands

| Command | Description |
|---------|-------------|
| `npm run scan` | Scan ComfyUI → new nodes → Claude → update knowledge/ |
| `npm run scan:dry` | Same without writing (dry-run) |
| `npm run sync-manager` | Update custom packs list from ComfyUI-Manager |
| `npm run analyze <url>` | Analyze repo (GitHub): README, __init__.py |
| `npm run add-node` | Interactive wizard to add a single node |
| `npm test` | Run tests (vitest) |
| `npm run mcp` | Start MCP server (after `npm run build`) |

## Documentation

Single entry point — **task-oriented navigation**:

- **[doc/README.md](doc/README.md)** — where to start, task-based navigation
- **[doc/INDEX.md](doc/INDEX.md)** — complete list of documents and links
- **[doc/QUICK-REFERENCE.md](doc/QUICK-REFERENCE.md)** — commands, examples, troubleshooting
- **[doc/GETTING-STARTED.md](doc/GETTING-STARTED.md)** — quick start (manual / wizard / scan)
- **[doc/MCP-SETUP.md](doc/MCP-SETUP.md)** — connect MCP in Cursor/Claude
- **Architecture:** [doc/node-discovery-system.md](doc/node-discovery-system.md), [doc/IMPLEMENTATION-CHECKLIST.md](doc/IMPLEMENTATION-CHECKLIST.md)
- **Knowledge base:** [knowledge/README.md](knowledge/README.md), [doc/knowledge-base-usage-guide.md](doc/knowledge-base-usage-guide.md)

## Requirements

- Node.js 18+
- ComfyUI (optional — running for `scan`)
- Anthropic API key — for automatic node description generation

## MCP Server (Cursor / Claude)

Server provides tools for AI:

- **list_node_types** — list nodes from knowledge base (optional filter by category/priority)
- **get_node_info(node_name)** — complete information about a node
- **check_compatibility(from_node, to_node)** — check output-to-input compatibility
- **suggest_nodes(task_description | input_type)** — suggest nodes by task or type

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

### Connect in Claude Desktop

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS). Add the same `mcpServers` block and restart Claude.

## License

MIT
