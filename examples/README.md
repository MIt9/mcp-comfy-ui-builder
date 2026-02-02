# MCP config examples

Configs are for Cursor or Claude Desktop. Replace all `/ABSOLUTE/PATH/TO/...` with your actual paths.

---

## cursor-mcp.json

Minimal config with execution (ComfyUI):

- **args** — absolute path to `dist/mcp-server.js` (required).
- **env.COMFYUI_HOST** — ComfyUI API URL for execute_workflow, get_execution_status, list_outputs, list_models, list_queue, sync_nodes_to_knowledge (live), etc. Remove the whole `env` block for knowledge-only use (list_node_types, build_workflow, templates).

---

## cursor-mcp-full.json

Full config with all optional env vars:

| Env variable | Purpose | When to set |
|--------------|---------|-------------|
| **COMFYUI_HOST** | ComfyUI API URL (default `http://127.0.0.1:8188`) | Execution, queue, outputs, models, live sync. |
| **COMFYUI_PATH** | Path to ComfyUI installation directory | `install_custom_node`, `install_model` (ComfyUI-Manager cm-cli). |
| **COMFYUI_KNOWLEDGE_DIR** | Path to the package `knowledge/` folder | When MCP is started by another app and cwd is not the package root; avoids ENOENT for sync_nodes_to_knowledge. |

**Replace in cursor-mcp-full.json:**

1. **args[0]** — path to `mcp-comfy-ui-builder/dist/mcp-server.js`.
2. **COMFYUI_HOST** — leave as `http://127.0.0.1:8188` or your ComfyUI URL (e.g. `http://localhost:8188`).
3. **COMFYUI_PATH** — path to your ComfyUI folder (e.g. `/home/user/ComfyUI` or `C:\ComfyUI`). Omit the key if you don't use install_custom_node / install_model.
4. **COMFYUI_KNOWLEDGE_DIR** — path to `mcp-comfy-ui-builder/knowledge`. Only needed if MCP runs from another app's cwd; otherwise you can remove this key.

You can copy `cursor-mcp-full.json` and delete any `env` keys you don't need.

---

See [doc/MCP-SETUP.md](../doc/MCP-SETUP.md) for quick connection checklist and troubleshooting.
