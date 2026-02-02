# Generate and Verify Pipeline

> Generate an image from a prompt and verify the result (image-to-text / comparison with expectation).

***

## Idea

1. **Generate**: user asks, e.g. "realistic apples on green fabric" → build txt2img workflow → execute → get image.
2. **Verify**: image from step 1 is passed to another workflow with image-to-text nodes (BLIP / caption) → get text description → compare with expectation (apples, green fabric) or verify logically in the assistant.

This document describes how to implement such a pipeline using MCP ComfyUI Builder and ComfyUI.

***

## Flow with Existing Tools

### Step 1: Generation

- `build_workflow("txt2img", { prompt: "realistic apples on green fabric", ... })` → get workflow JSON.
- `execute_workflow(workflow)` → get `prompt_id`.
- Wait for completion (e.g. check queue or repeated status calls).
- `get_execution_status(prompt_id)` → ensure there are output images and view URLs.

### Step 2: Prepare Image for Second Workflow

SaveImage stores images in ComfyUI **output**, while LoadImage reads from **input** by default. To use the generated image in the verification workflow (e.g. image-to-text):

- **prepare_image_for_workflow(prompt_id)** — loads the first output image from `/view`, uploads it to `/upload/image` (input) and returns the filename for LoadImage.

Then you can build the second workflow with parameter `image: "<returned filename>"`.

### Step 3: Verification Workflow (image → text)

Options:

- **image_caption template** (requires custom nodes):
  - `build_workflow("image_caption", { image: "<filename from prepare_image_for_workflow>" })` → workflow: LoadImage → BLIPCaption (or similar).
  - Install one of: [ComfyUI-Blip](https://github.com/1038lab/ComfyUI-Blip), [comfyui-art-venture](https://github.com/cubiq/comfyui_art_venture) (BLIPCaption), or [img2txt-comfyui-nodes](https://github.com/christian-byrne/img2txt-comfyui-nodes) (BLIP / LLaVA / MiniCPM).
- **Custom workflow**: if you have a different node name (e.g. different class_type), build the workflow manually or via `suggest_nodes` / `get_node_info`.

Execute: `execute_workflow(workflow_verify)` → get `prompt_id_verify` → `get_execution_status(prompt_id_verify)`. If the node returns text, it will appear in the status (field `node X text: ...`).

### Step 4: Compare with Expectation

- Expectation: "apples", "green fabric", "realistic".
- Description from BLIP/caption: text from `get_execution_status` for the verification workflow.
- Assistant or your code can verify keyword presence or semantic match (e.g. via LLM or simple keywords).

***

## Full Example (pseudocode)

```
1. workflow_gen = build_workflow("txt2img", { prompt: "realistic apples on green fabric", width: 512, height: 512 })
2. prompt_id_gen = execute_workflow(workflow_gen)
3. [wait for completion]
4. get_execution_status(prompt_id_gen)  → ensure there are images
5. prepare_image_for_workflow(prompt_id_gen)  → filename, e.g. "ComfyUI_00001.png"
6. workflow_verify = build_workflow("image_caption", { image: "ComfyUI_00001.png" })
7. prompt_id_verify = execute_workflow(workflow_verify)
8. [wait for completion]
9. get_execution_status(prompt_id_verify)  → node 2 text: "apples on green fabric ..."
10. Compare the obtained text with the expectation (apples, green fabric).
```

***

## Alternative: External Vision API

If you prefer not to install custom nodes in ComfyUI:

1. After `get_execution_status(prompt_id)` use the **view URL** of the generated image.
2. Your service or assistant can call an external image-to-text (e.g. OpenAI Vision, Google Vision) with this URL or after downloading the image.
3. Do the comparison with expectation in code or in the dialog.

In this case `prepare_image_for_workflow` and the `image_caption` template are not required; the view URL and external API are enough.

***

## Summary

| Step | Tool / action |
|------|-------------------|
| Generate | `build_workflow("txt2img", ...)` → `execute_workflow` |
| Get result | `get_execution_status(prompt_id)` (images + view URLs) |
| Prepare for second workflow | `prepare_image_for_workflow(prompt_id)` → filename for LoadImage |
| Verify (image→text in ComfyUI) | `build_workflow("image_caption", { image: filename })` → `execute_workflow` → `get_execution_status` (text) |
| Compare | Keywords or LLM on the obtained description and expectation |

The **image_caption** template requires an installed package with a BLIPCaption-type node (or similar). If you have a different class_type — build the workflow manually and use the same approach: LoadImage(file from prepare_image_for_workflow) → your caption node.
