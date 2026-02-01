# ✅ TODO List

> Workflow Builder plan (like @makafeli/n8n-workflow-builder for ComfyUI)

**Last Updated:** 2026-02-01  
**Status:** Phase 6–7 done ✅; Phase 8 save/load done ✅. Next: This Week (publish) or Phase 8 rest (more templates).

---

## 🔥 Phase 6 — ComfyUI Client & Workflow Builder ✅

### ComfyUI API client

- [x] **Add `src/comfyui-client.ts`** (or `src/workflow/comfyui-api.ts`)
  - [x] `submitPrompt(workflowJson): Promise<{ prompt_id }>` — POST `/prompt`
  - [x] `getHistory(promptId?): Promise<HistoryEntry[]>` — GET `/history` or `/history/{id}`
  - [x] `getQueue(): Promise<QueueStatus>` — GET `/queue`
  - [x] Base URL from `COMFYUI_HOST` (default `http://127.0.0.1:8188`)
  - [x] Timeout, retries, clear errors

- [x] **Types** for workflow JSON, history, queue (see ComfyUI API) — `src/types/comfyui-api-types.ts`

- [x] **Config** — document `COMFYUI_HOST` in README and `.env.example` (optional; only for execute/status)

- [x] **Tests** — unit tests with mocked fetch for submit, history, queue — `tests/comfyui-client.test.ts`

### Workflow builder

- [x] **Add `src/workflow/workflow-builder.ts`**
  - [x] ComfyUI workflow format: node id → `{ class_type, inputs }`, inputs can be literal or `[nodeId, outputIndex]`
  - [x] `buildFromTemplate("txt2img", params)` using knowledge base (base-nodes.json, node-compatibility.json)
  - [x] At least one template: **txt2img** (CheckpointLoaderSimple → CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage)

- [x] **Tests** — builder returns valid workflow JSON (required inputs present, references valid) — `tests/workflow-builder.test.ts`

---

## 🚀 Phase 7 — MCP Tools (Build & Execute) ✅

### New MCP tools

- [x] **`list_templates`** — no inputs. Returns available template ids (e.g. txt2img).
- [x] **`build_workflow`** — inputs: template (e.g. txt2img), params (width, height, steps, cfg, prompt, seed). Returns workflow JSON.
- [x] **`execute_workflow`** — inputs: workflow (JSON string). Calls ComfyUI client submitPrompt, returns prompt_id. Requires COMFYUI_HOST.
- [x] **`get_execution_status`** — inputs: prompt_id. Returns status, outputs (e.g. image filenames). GET /history/{id}.
- [x] **`list_queue`** — no inputs. Returns queue_running, queue_pending. GET /queue.

### MCP server

- [x] Register new tools in `src/mcp-server.ts`
- [x] Load ComfyUI client only when a tool that needs it is called (or when COMFYUI_HOST set)
- [x] Graceful "ComfyUI not configured" for execute_workflow, get_execution_status, list_queue (return message, no crash)
- [x] **Tests** — MCP tool tests: list_templates, build_workflow in mcp-tools.test.ts; workflow-storage tests added

### Docs

- [x] README: "Workflow Builder" section — build_workflow, execute_workflow, get_execution_status, list_queue; COMFYUI_HOST for execution
- [x] doc/MCP-SETUP.md: new tools, when ComfyUI is required
- [x] .env.example: optional COMFYUI_HOST for workflow execution

---

## 📦 This Week (if not done)

### Publication

- [ ] Test locally: `npm link` (optional)
- [x] `npm login` → `npm publish` ✅
- [ ] Test install: `npm i -g mcp-comfy-ui-builder` (optional)

### GitHub

- [ ] Add description and topics on GitHub repo

---

## 💡 Phase 8 — Optional (Backlog)

- [x] **Save/Load workflows** — save_workflow, list_saved_workflows, load_workflow (workflows/*.json) ✅
- [ ] **More templates** — img2img, inpainting
- [x] **doc/workflow-builder.md** — templates, params, ComfyUI workflow format ✅
- [ ] Web UI, Docker, plugin system (later)

---

## 🐛 Known Issues

*(Add as you find)*

- [ ] ...

---

## 📝 Notes

- **Reference:** [NEXT-STEPS.md](NEXT-STEPS.md) — full Workflow Builder plan (Phase 1–3 = done; Phase 4 = optional)
- **Timeline:** [ROADMAP.md](ROADMAP.md) — phases 6–8
- **ComfyUI API:** [doc/comfyui-api-quick-reference.md](doc/comfyui-api-quick-reference.md) — /prompt, /history, /queue
- **Config:** `COMFYUI_HOST` default `http://127.0.0.1:8188` when not set

---

**Quick Start (current):**
1. `npm test && npm run build` (postbuild runs seed)
2. `npm run mcp` — use list_node_types, get_node_info, check_compatibility, suggest_nodes, list_templates, build_workflow, save_workflow, list_saved_workflows, load_workflow
3. For execute/status/queue: set COMFYUI_HOST (e.g. in .env) and use execute_workflow, get_execution_status, list_queue
