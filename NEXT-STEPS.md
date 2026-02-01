# 🚀 Next Steps — Workflow Builder (like n8n-workflow-builder)

> Roadmap: MCP server that **creates and executes** ComfyUI workflows (like @makafeli/n8n-workflow-builder for n8n)

**Current Status:** Full workflow lifecycle — build → save/load → execute → status ✅ (Phase 1–3 + save/load done)  
**Next:** More templates (img2img, inpainting)  
**Last Updated:** 2026-02-01

---

## 📊 Current State vs Target

| Capability | n8n-workflow-builder | mcp-comfy-ui-builder (now) | mcp-comfy-ui-builder (next) |
|------------|----------------------|----------------------------|-----------------------------|
| Connect to engine | ✅ n8n API | ✅ ComfyUI API (COMFYUI_HOST, default localhost:8188) | — |
| List nodes / workflows | ✅ List workflows | ✅ list_node_types, suggest_nodes, list_templates, list_saved_workflows, list_queue | — |
| Create workflow | ✅ Create with nodes | ✅ build_workflow → ComfyUI JSON (txt2img) | more templates |
| Execute workflow | ✅ Execute | ✅ execute_workflow (POST /prompt) | — |
| Get execution status | ✅ Status | ✅ get_execution_status (GET /history) | — |
| Manage lifecycle | ✅ Activate/deactivate/delete | ✅ queue status, save/load workflows | — |

---

## 🎯 Phase 1: ComfyUI API Client (foundation) ✅

**Goal:** Module to talk to ComfyUI — submit workflow, get history, queue.

### 1.1 ComfyUI client module

- [x] **`src/comfyui-client.ts`**
  - `submitPrompt(workflow): Promise<{ prompt_id }>` — POST `/prompt`, body `{ prompt: workflow }`
  - `getHistory(promptId?): Promise<HistoryEntry[]>` — GET `/history` or `/history/{prompt_id}`
  - `getQueue(): Promise<QueueStatus>` — GET `/queue`
  - Base URL from env `COMFYUI_HOST` (default `http://localhost:8188`)
  - Timeout, retries, clear errors

- [x] **Types** — `src/types/comfyui-api-types.ts` (workflow, history, queue)

- [x] **Config** — README and `.env.example` (COMFYUI_HOST optional; only for execute/status)

### 1.2 Tests

- [x] Unit tests with mocked fetch — `tests/comfyui-client.test.ts`
- [ ] Optional: integration test with real ComfyUI (skip if COMFYUI_HOST not set).

**Deliverable:** ✅ ComfyUI API client; MCP tools use it when COMFYUI_HOST set.

---

## 🎯 Phase 2: Workflow Builder (JSON from task/nodes) ✅

**Goal:** From template + params produce valid ComfyUI workflow JSON.

### 2.1 Workflow format

- [x] **ComfyUI workflow structure** — node id → `{ class_type, inputs }`; inputs literal or `[nodeId, outputIndex]`.
- [x] **Reference** — base-nodes.json, node-compatibility.json, comfyui-api-quick-reference.md.

### 2.2 Builder API

- [x] **`src/workflow/workflow-builder.ts`**
  - `buildFromTemplate(templateId, params?)` — returns ComfyUI-ready object.
  - `listTemplates()` — available template ids.
- [x] **Templates** — **txt2img** (CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode → SaveImage).
- [ ] Optional: `buildFromNodeChain`; img2img, inpainting (Phase 4).

### 2.3 Tests

- [x] buildFromTemplate("txt2img", params) produces valid workflow JSON — `tests/workflow-builder.test.ts`.
- [ ] Optional: submit via client to real ComfyUI.

**Deliverable:** ✅ Generate ComfyUI workflow JSON from template txt2img.

---

## 🎯 Phase 3: MCP Tools — Build & Execute ✅

**Goal:** AI can create and run workflows via MCP (like n8n-workflow-builder).

### 3.1 New MCP tools

- [x] **`list_templates`** — list available template ids (e.g. txt2img).
- [x] **`build_workflow`** — template + params → workflow JSON (no ComfyUI needed).
- [x] **`execute_workflow`** — workflow (JSON string) → submitPrompt → prompt_id; requires COMFYUI_HOST.
- [x] **`get_execution_status`** — prompt_id → status, outputs, view URLs for images.
- [x] **`list_queue`** — queue_running, queue_pending.

### 3.2 MCP server updates

- [x] ComfyUI client used only when a tool that needs it is called.
- [x] Graceful "ComfyUI not configured" for execute_workflow, get_execution_status, list_queue (friendly message, no crash).
- [x] README and MCP-SETUP: COMFYUI_HOST for execute/status/queue; list_node_types / get_node_info / check_compatibility / suggest_nodes / list_templates / build_workflow need no ComfyUI.

### 3.3 Tests

- [ ] MCP tool tests with mocked client (optional; client tests cover submit/history/queue).
- [ ] Optional: E2E with real ComfyUI.

**Deliverable:** ✅ AI can build workflow → execute → check status via MCP.

---

## 🎯 Phase 4: Optional — Save/Load & More Templates

**Goal:** Persist workflows, more templates, better UX.

### 4.1 Save/Load workflows (optional)

- [x] **`save_workflow`** — save workflow JSON to file (`workflows/<name>.json`) and return path. ✅
- [x] **`list_saved_workflows`** — list names/paths of saved workflows. ✅
- [x] **`load_workflow`** — load by name/path and return JSON (for use with execute_workflow). ✅

### 4.2 More templates

- [ ] **img2img** — LoadImage → VAEEncode → … → KSampler → VAEDecode → SaveImage.
- [ ] **inpainting** — mask + image path, etc. (if time permits).

### 4.3 Docs & UX

- [x] Update README: "Workflow Builder" section — save/load, build_workflow, execute_workflow, get_execution_status, list_queue; COMFYUI_HOST for execution. ✅
- [x] Update doc/MCP-SETUP.md with new tools and config. ✅
- [x] Add doc/workflow-builder.md: templates, params, ComfyUI workflow format. ✅

**Deliverable:** Optional save/load; more templates; docs aligned with workflow builder.

---

## 📋 Summary Checklist (Workflow Builder)

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | ComfyUI API client (submit, history, queue) | ✅ |
| 1.2 | Tests for client | ✅ |
| 2.1 | Workflow format + types | ✅ |
| 2.2 | workflow-builder.ts (template → JSON) | ✅ |
| 2.3 | Tests for builder | ✅ |
| 3.1 | MCP: list_templates, build_workflow, execute_workflow, get_execution_status, list_queue | ✅ |
| 3.2 | MCP: graceful "no ComfyUI" for execute/status/queue | ✅ |
| 3.3 | Tests for new MCP tools | optional |
| 4.1 | Save/load workflows | ✅ |
| 4.2 | More templates (img2img, inpainting) | next |
| 4.3 | doc/workflow-builder.md | ✅ |

---

## 📝 Notes

- **Reference:** @makafeli/n8n-workflow-builder — CRUD + execute workflows against live engine; we mirror that for ComfyUI (build + execute + status + queue).
- **ComfyUI API:** POST `/prompt` (workflow JSON), GET `/history/{prompt_id}`, GET `/queue`. See [doc/comfyui-api-quick-reference.md](doc/comfyui-api-quick-reference.md).
- **Knowledge base:** Stays seed-based; no ComfyUI required for list/get/check/suggest. ComfyUI only needed for execute and status/queue.
- **Config:** `COMFYUI_HOST` optional (default `http://localhost:8188`); required only for execute_workflow, get_execution_status, list_queue.

---

*Next Steps v2.2 | Phase 1–3 + save/load + doc done; more templates next | 2026-02-01*
