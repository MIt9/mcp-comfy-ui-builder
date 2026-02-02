# Install Custom Nodes and Models via MCP

> Install custom nodes, checkpoints, LoRA and other models via MCP without developer involvement.

***

## Requirements

- **COMFYUI_PATH** — path to ComfyUI directory on disk (e.g. `/home/user/ComfyUI` or `C:\ComfyUI`). MCP server runs on the same machine where this path is set.
- For **custom nodes**: ComfyUI must have **ComfyUI-Manager** installed (in `custom_nodes/ComfyUI-Manager`), and it must contain the `cm-cli.py` file.
- For **models**: download always works (fetch via URL). If **comfy-cli** is installed (`pip install comfy-cli`), it is used for model downloads.

***

## MCP Tools

### install_custom_node

Installs one or more custom node packages via ComfyUI-Manager (cm-cli).

| Parameter   | Description |
|-------------|------|
| node_names  | Array of package names as in ComfyUI-Manager (e.g. `ComfyUI-Blip`, `ComfyUI-Impact-Pack`, `WAS-Node-Suite`). |
| channel     | Optional: channel (see cm-cli documentation). |
| mode        | Optional: `remote`, `local` or `cache`. |

**Example:** install ComfyUI-Blip and WAS-Node-Suite:
- `install_custom_node({ "node_names": ["ComfyUI-Blip", "WAS-Node-Suite"] })`

After installation, **restart ComfyUI** so the new nodes are loaded.

---

### install_model

Downloads a model (checkpoint, LoRA, VAE, etc.) from a direct URL and saves it to the appropriate ComfyUI folder.

| Parameter   | Description |
|------------|------|
| url        | Direct download link (Civitai, HuggingFace, etc.). |
| model_type | Model type (default `checkpoint`). See below. |

**Model types (model_type):**

| model_type     | ComfyUI folder        |
|----------------|------------------------|
| checkpoint     | models/checkpoints     |
| lora          | models/loras           |
| vae           | models/vae             |
| controlnet    | models/controlnet      |
| clip          | models/clip            |
| embeddings    | embeddings             |
| hypernetwork  | models/hypernetworks   |
| upscale_models| models/upscale_models   |
| clip_vision   | models/clip_vision     |
| unet          | models/unet            |
| diffusers     | models/diffusers       |

**Examples:**
- Checkpoint: `install_model({ "url": "https://.../model.safetensors", "model_type": "checkpoint" })`
- LoRA: `install_model({ "url": "https://civitai.com/.../download", "model_type": "lora" })`
- VAE: `install_model({ "url": "https://.../vae.safetensors", "model_type": "vae" })`

If **comfy-cli** is in PATH, it is used; otherwise the file is downloaded directly (fetch) to `COMFYUI_PATH/models/<type>/`.

***

## Configuring COMFYUI_PATH

Add the environment variable to your MCP server configuration (Cursor, Claude Desktop):

**Cursor** — in the server block:
```json
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "node",
      "args": ["/path/to/mcp-comfy-ui-builder/dist/mcp-server.js"],
      "env": {
        "COMFYUI_PATH": "/path/to/ComfyUI"
      }
    }
  }
}
```

**Claude Desktop** — add `env` with `COMFYUI_PATH` for the corresponding server in the MCP config file.

On Windows use the full path, e.g. `C:\\Users\\Name\\ComfyUI`.

***

## Summary

| Action                | Tool                  | COMFYUI_PATH | Other |
|-----------------------|------------------------|--------------|------|
| Install nodes         | install_custom_node    | Yes          | ComfyUI-Manager in custom_nodes |
| Download model / LoRA | install_model          | Yes          | Optional: comfy-cli in PATH |

After installing nodes — restart ComfyUI. Models will appear in the appropriate folders and in the UI after refreshing lists (or restart).
