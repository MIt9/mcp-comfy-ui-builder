# Plugins (templates & macros)

> How to extend mcp-comfy-ui-builder with data-only plugins.

---

## Overview

The MCP server can load **plugins** from the `plugins/` directory at startup.  
Plugins are **data-only**: they are described by JSON files and can contribute:

- **macros** — reusable sub-workflows, visible via `list_macros` / `insert_macro` / `getMacro`;
- **templates** — parameterized workflows (currently loaded as data, reserved for future MCP tools).

No arbitrary JavaScript/TypeScript code is executed from plugins.

---

## Directory layout

At project root:

- `plugins/` — all plugins live here.
  - `plugins/<plugin-id>/plugin.json` — one JSON file per plugin.

Example:

```text
plugins/
  example/
    plugin.json
  my-studio/
    plugin.json
```

On server startup:

- the MCP server reads all `plugins/*/plugin.json`,
- registers plugin macros in the macro registry,
- keeps templates in memory for future use.

You can re-read plugins at runtime via the `reload_plugins` MCP tool.

---

## plugin.json schema (informal)

Top-level structure:

```jsonc
{
  "id": "example",          // required, unique across plugins
  "name": "Example plugin", // required, human‑readable
  "version": "0.1.0",       // required
  "description": "Optional description",
  "author": "Optional author",

  "macros": [ /* optional array of macros */ ],
  "templates": [ /* optional array of templates */ ]
}
```

### Macros

Each macro in `macros` looks like:

```jsonc
{
  "id": "upscale_simple",           // required, unique within this plugin
  "name": "Upscale (plugin example)",
  "description": "LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage",

  "inputs": [
    {
      "name": "image",              // external port name
      "type": "IMAGE",              // free-form type label
      "nodeId": "1",                // node id inside nodes{}
      "inputName": "image"          // input name on that node
    }
  ],

  "outputs": [
    {
      "name": "image",
      "type": "IMAGE",
      "nodeId": "4",
      "outputIndex": 0
    }
  ],

  "nodes": {
    "1": {
      "class_type": "LoadImage",
      "inputs": {}
    },
    "2": {
      "class_type": "UpscaleModelLoader",
      "inputs": { "model_name": "RealESRGAN_x4plus.pth" }
    },
    "3": {
      "class_type": "ImageUpscaleWithModel",
      "inputs": { "image": ["1", 0], "upscale_model": ["2", 0] }
    },
    "4": {
      "class_type": "SaveImage",
      "inputs": { "images": ["3", 0] }
    }
  }
}
```

Notes:

- `nodes` is a standard **ComfyUI workflow fragment**: `nodeId → { class_type, inputs }`.
- `inputs` and `outputs` describe which node ports are visible externally:
  - `inputs[*].nodeId` / `inputName` — where to inject values or links,
  - `outputs[*].nodeId` / `outputIndex` — which output to expose.

### Templates

Templates in `templates` mirror `WorkflowTemplate` from `workflow-template.ts`:

```jsonc
{
  // optional; if present, will be prefixed with "<plugin-id>:" internally
  "id": "my_tpl",

  "name": "My template",
  "description": "Any description",
  "category": "plugin",

  "parameters": [
    {
      "name": "prompt",
      "type": "string",
      "required": true,
      "default": "",
      "description": "Main text prompt",
      "nodeBindings": [
        { "nodeId": "2", "inputName": "text" }
      ]
    }
  ],

  "workflow": {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "text": "", "clip": ["1", 1] } }
  }
}
```

Currently plugin templates are **loaded and kept in memory**, but not yet exposed via separate MCP tools. They can be used later in code or in future tools.

---

## IDs and collisions

To avoid collisions between core and plugins:

- Core macros keep their ids as-is (e.g. `upscale_refine`).
- Plugin macros and templates get **prefixed** with plugin id:
  - macro with `"id": "upscale_simple"` in plugin `"id": "example"` → internal id `example:upscale_simple`,
  - template with `"id": "my_tpl"` in plugin `"id": "studio"` → internal id `studio:my_tpl`.

When you call `insert_macro` via MCP, you must use the **internal id** (e.g. `example:upscale_simple`).

---

## MCP tools for plugins

Plugins are controlled via these MCP tools (see [MCP-SETUP.md](MCP-SETUP.md) for full list):

- **`list_plugins`** (no inputs, no ComfyUI needed)
  - Returns JSON array of:
    - `id`, `name`, `version`, `description`, `author`,
    - `macros` (count), `templates` (count).
  - Use this to inspect which plugins are currently loaded.

- **`reload_plugins`** (no inputs, no ComfyUI needed)
  - Re-reads all `plugins/*/plugin.json`.
  - Rebuilds the macro registry (core + plugins).
  - Returns a short text summary (count + JSON of summaries).

Plugin macros automatically appear in:

- **`list_macros`** — now returns **builtin + plugin** macros.
- **`getMacro(id)`** / **`get_macro` (MCP)** — can look up `example:upscale_simple`.
- **`insert_macro(workflow_id, macro_id, input_connections)`** — accepts plugin macro ids.

---

## Example workflow with a plugin macro

High-level flow:

1. Ensure there is a plugin (e.g. `plugins/example/plugin.json`).
2. Call `reload_plugins` (optional; done automatically at server start).
3. Call `list_plugins` to see it (id should be `example`).
4. Call `list_macros`:
   - you should see one with id `example:upscale_simple`.
5. Use dynamic builder:
   - `create_workflow` → `wf_123`,
   - `insert_macro(wf_123, "example:upscale_simple", { image: "input.png" })`,
   - `get_workflow_json(wf_123)` → JSON with LoadImage/UpscaleModelLoader/ImageUpscaleWithModel/SaveImage,
- `execute_workflow` on that JSON; use `wait=false` to queue without waiting.

No changes to core TypeScript code are needed to add/remove such macros; only plugin JSON.

