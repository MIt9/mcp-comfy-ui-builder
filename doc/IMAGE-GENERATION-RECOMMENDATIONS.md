# Image generation recommendations

> How to get good results and avoid common pitfalls: resources, text-in-image, and model choice.

---

## Before building any generation workflow

1. **Call `get_system_resources`** (or **`get_generation_recommendations`**) to get GPU/VRAM/RAM and limits (max_width, max_height, suggested_model_size, max_batch_size). Use these to avoid out-of-memory (OOM).
2. **Respect the limits** when calling `build_workflow`: width ≤ max_width, height ≤ max_height, batch_size ≤ max_batch_size. Choose a checkpoint that matches suggested_model_size (e.g. SD 1.5 for light, SD XL for heavy only when tier is high or very_high).

See [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) for the recommended flow.

---

## Images with text (signs, logos, captions, labels)

Many diffusion models **render text poorly**: blurry, wrong letters, or gibberish. This is especially true for:

- **SD 1.5** and **SD XL base** checkpoints — not trained for legible text.
- Low steps or very high CFG — can worsen text clarity.

### When the user asks for text in the image

- **Detect intent**: Prompts like “a sign that says Hello”, “logo with text”, “caption”, “label”, “poster with words”, “t-shirt with the text …” suggest the image should contain **legible text**.
- **Call `get_generation_recommendations(prompt)`** with the user’s description. If the prompt suggests text-in-image, the tool returns:
  - **text_in_image_advice**: Prefer FLUX, SD 3, or checkpoints known for text; use 25–30 steps and CFG 7–8; set expectations if only SD 1.5/XL is available.

### Recommended approach

| Goal | Recommendation |
|------|----------------|
| **Best text quality** | Use **FLUX** (e.g. FLUX.1 dev/schnell) or **SD 3** (e.g. SD3 medium) if available on the station. Check with `list_models` or `check_workflow_models`. |
| **Steps / CFG** | 25–30 steps, CFG 7–8 for clearer detail when aiming for text. |
| **Only SD 1.5 / SD XL** | Tell the user that base models often render text imperfectly; they may need to try several seeds or use img2img/outpainting to refine. |
| **Custom nodes** | Some ComfyUI custom nodes (e.g. GLIGEN-style, or dedicated “text in image” nodes) can help; discover with `search_nodes` or `discover_nodes_live`. |

### MCP tools to use

- **get_generation_recommendations(prompt?)** — Returns system resource limits and, if the prompt suggests text-in-image, advice on models and settings. Call when planning a txt2img/img2img for a user request that might include text.
- **get_system_resources** — Resource limits only (no prompt analysis).
- **list_models** / **check_workflow_models** — See which checkpoints (e.g. FLUX, SD3) are available before building the workflow.

---

## Summary

- **Always** use resource recommendations (get_system_resources or get_generation_recommendations) before building generation workflows.
- **When the user wants text in the image**, call get_generation_recommendations with their prompt; prefer FLUX/SD3 and 25–30 steps, and set expectations if only SD 1.5/XL is available.
