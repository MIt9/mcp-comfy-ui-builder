# MCP Server — ComfyUI Node Discovery

> How to connect the MCP server in Cursor and Claude Desktop

***

## What the server provides

| Tool | Description |
|------|------|
| **list_node_types** | List nodes from knowledge (optional: category, priority) |
| **get_node_info(node_name)** | Full information about a node from base-nodes.json |
| **check_compatibility(from_node, to_node)** | Whether output of one node can be connected to input of another |
| **suggest_nodes(task_description \| input_type)** | Node suggestions by task description or output type |
| **list_templates** | List workflow template ids (e.g. txt2img) |
| **build_workflow(template, params?)** | Build ComfyUI workflow JSON from template (no ComfyUI needed) |
| **save_workflow(name, workflow)** | Save workflow to workflows/\<name\>.json; returns path |
| **list_saved_workflows** | List saved workflows (names and paths) from workflows/ |
| **load_workflow(name_or_path)** | Load workflow by name or path; returns JSON for execute_workflow |
| **execute_workflow(workflow)** | Submit workflow to ComfyUI; returns prompt_id (requires COMFYUI_HOST) |
| **get_execution_status(prompt_id)** | Get status and image outputs (requires COMFYUI_HOST) |
| **list_queue** | List running and pending prompts (requires COMFYUI_HOST) |

Data is loaded from `knowledge/base-nodes.json` and `knowledge/node-compatibility.json` at server startup. For **execute_workflow**, **get_execution_status**, and **list_queue**, set `COMFYUI_HOST` (default `http://127.0.0.1:8188` if not set) and ensure ComfyUI is running. For list_node_types, get_node_info, check_compatibility, suggest_nodes, list_templates, build_workflow, save_workflow, list_saved_workflows, and load_workflow, no ComfyUI connection is needed.

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

1. Open MCP settings (Cursor Settings → MCP or corresponding config).
2. Add server (replace path with yours):

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

3. Restart Cursor.

After connecting, AI can call the tools above. For workflow execution (execute_workflow, get_execution_status, list_queue), set `COMFYUI_HOST` in the environment or in a `.env` file in the project root (see [.env.example](../.env.example)).

***

## Connecting in Claude Desktop

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- Create the file if it doesn't exist.
- Add the same `mcpServers` block (with absolute path to `dist/mcp-server.js`).
- Restart Claude Desktop (fully quit the application, not just close the window).

***

## Verification

After connecting, make sure Cursor/Claude sees the tools (e.g., in the MCP tools list). You can ask: "List ComfyUI node types with category loaders" or "Get info for KSampler" — AI will call the corresponding tools.

***

## Troubleshooting

| Problem | What to check |
|----------|----------------|
| **MCP doesn't see tools** | Path in `args` must be **absolute** to `dist/mcp-server.js`. After changing config — fully restart Cursor/Claude. |
| **Server doesn't start** | Run `npm run build` from project root. Make sure there's a `knowledge/` folder with `base-nodes.json` and `node-compatibility.json`. |
| **Empty node list** | File `knowledge/base-nodes.json` must contain `nodes` object. Run `npm run seed` or add nodes manually. |
| **ENOENT error / module not found** | Run MCP from **project root** (where `knowledge/` and `dist/` are visible). In Cursor config `args` — path specifically to `dist/mcp-server.js`. |

Example config for Cursor: [examples/cursor-mcp.json](../examples/cursor-mcp.json) (copy and substitute your path).

***

*MCP Setup v1.1 | 2026-02-01*
