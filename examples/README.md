# MCP config examples

Configs are for Cursor or Claude Desktop. Replace all `/ABSOLUTE/PATH/TO/...` with your actual paths.

---

## If the server fails to start: "spawn node ENOENT"

Cursor/IDE may not have `node` in its PATH. Use the **full path to Node** in `command`:

- Run in terminal: `which node` (or `nvm which current` if you use nvm).
- In MCP config set `"command": "/full/path/to/node"` (e.g. `"/opt/homebrew/bin/node"` or `"/usr/local/bin/node"`).

See [doc/MCP-SETUP.md](../doc/MCP-SETUP.md#command-full-path-to-node) for details.

---

## cursor-mcp.json

Minimal config with execution (ComfyUI):

- **command** — `"node"` or **full path to node** if you see "spawn node ENOENT" (e.g. `"/opt/homebrew/bin/node"`).
- **args** — absolute path to `dist/mcp-server.js` (required).
- **env.COMFYUI_HOST** — ComfyUI API URL for execute_workflow, get_execution_status, list_outputs, list_models, list_queue, sync_nodes_to_knowledge (live), etc. Remove the whole `env` block for knowledge-only use (list_node_types, build_workflow, templates).

---

## cursor-mcp-full-template.json (full example — copy and replace your paths)

Ready-to-use template: copy the file into your MCP settings and replace **three** placeholders:

| Replace | With | How to get it |
|---------|------|---------------|
| **REPLACE_WITH_FULL_PATH_TO_NODE** | Full path to the Node executable | In terminal: `which node` (or `nvm which current` if using nvm). E.g. `"/opt/homebrew/bin/node"` or `"/usr/local/bin/node"`. |
| **REPLACE_WITH_PACKAGE_PATH** | Path to the `mcp-comfy-ui-builder` package folder (no `/dist/...`) | Global install: `npm root -g` gives `.../node_modules`; package is at `$(npm root -g)/mcp-comfy-ui-builder`. Or: `node -e "console.log(require('path').join(require('path').dirname(require.resolve('mcp-comfy-ui-builder/package.json')))"`. |
| **REPLACE_WITH_COMFYUI_PATH** | Path to your ComfyUI folder (where `main.py` lives) | E.g. `"/home/user/ComfyUI"`, `"C:\\ComfyUI"`. If you don't use install_custom_node / install_model, you can remove this key from `env`. |

**Example after replacement (macOS, Homebrew, global npm):**

```json
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/opt/homebrew/lib/node_modules/mcp-comfy-ui-builder/dist/mcp-server.js"],
      "env": {
        "COMFYUI_HOST": "http://127.0.0.1:8188",
        "COMFYUI_PATH": "/Users/me/ComfyUI",
        "COMFYUI_KNOWLEDGE_DIR": "/opt/homebrew/lib/node_modules/mcp-comfy-ui-builder/knowledge"
      }
    }
  }
}
```

Replace with your paths; you can change `COMFYUI_HOST` to `http://localhost:8188` if ComfyUI listens there. After editing — restart Cursor.

---

## cursor-mcp-full.json

Same set of fields, but with short placeholders (`/ABSOLUTE/PATH/TO/...`). Handy if you prefer to type paths manually.

| Env variable | Purpose | When to set |
|--------------|---------|-------------|
| **COMFYUI_HOST** | ComfyUI API URL (default `http://127.0.0.1:8188`) | Execution, queue, outputs, models, live sync. |
| **COMFYUI_PATH** | Path to ComfyUI installation directory | For `install_custom_node`, `install_model` (ComfyUI-Manager). |
| **COMFYUI_KNOWLEDGE_DIR** | Path to the package `knowledge/` folder | When MCP is started from another app's cwd; avoids ENOENT for sync_nodes_to_knowledge. |

**Replace in cursor-mcp-full.json:**

1. **command** — full path to Node if you see "spawn node ENOENT": run `which node` and use that path. Otherwise `"node"` is fine.
2. **args[0]** — path to `mcp-comfy-ui-builder/dist/mcp-server.js`.
3. **COMFYUI_HOST** — leave as `http://127.0.0.1:8188` or your ComfyUI URL.
4. **COMFYUI_PATH** — path to your ComfyUI folder. You can remove this key if you don't use install_custom_node / install_model.
5. **COMFYUI_KNOWLEDGE_DIR** — path to `mcp-comfy-ui-builder/knowledge`. You can remove it if MCP runs from the package root.

You can copy `cursor-mcp-full.json` and delete any `env` keys you don't need.

---

See [doc/MCP-SETUP.md](../doc/MCP-SETUP.md) for quick connection checklist and troubleshooting.
