# 🗺️ Project Roadmap

> mcp-comfy-ui-builder: from **knowledge-only** MCP to **workflow builder** (like @makafeli/n8n-workflow-builder for ComfyUI)

---

## 📍 Current Position: Knowledge Base + 4 MCP Tools ✅

```
┌─────────────────────────────────────────────────────────────┐
│  Phases 1–5: DONE ✅                                        │
│  ├─ Seed knowledge base (no ComfyUI/API)                    │
│  ├─ CLI: seed, sync-manager                                  │
│  ├─ MCP: list_node_types, get_node_info,                    │
│  │       check_compatibility, suggest_nodes                  │
│  ├─ Tests (scanner, updater, mcp-tools)                      │
│  └─ Docs (README, doc/, knowledge/)                          │
└─────────────────────────────────────────────────────────────┘
```

**Gap vs n8n-workflow-builder:** We do **not** yet create or execute workflows. Next phases add that.

---

## 🎯 Roadmap Timeline

### ⚡ Phase 6: Workflow Builder — ComfyUI API & Build (Weeks 1–2)

**Goal:** ComfyUI client + workflow JSON builder; no MCP execute yet.

```
Week 1: ComfyUI API client
├─ ComfyUI client module (submit /prompt, GET /history, GET /queue)
├─ Types: workflow JSON, history, queue
├─ Config: COMFYUI_HOST (optional)
└─ Tests (mocked fetch)

Week 2: Workflow builder
├─ Workflow format (node id → class_type, inputs)
├─ buildFromTemplate("txt2img", params) → ComfyUI JSON
├─ Use knowledge base for node defs
└─ Tests (builder output valid)
```

**Deliverables:**
- ✅ `src/comfyui-client.ts` (or workflow/comfyui-api.ts)
- ✅ `src/workflow/workflow-builder.ts` — template → JSON
- ✅ At least one template: txt2img
- ✅ Tests for client and builder

---

### 🚀 Phase 7: Workflow Builder — MCP Tools (Weeks 3–4)

**Goal:** AI can build and execute workflows via MCP (like n8n-workflow-builder).

```
Week 3: MCP tools
├─ build_workflow(template, params) → workflow JSON
├─ execute_workflow(workflow) → prompt_id
├─ get_execution_status(prompt_id) → status, outputs
└─ list_queue() → running + pending

Week 4: Polish & docs
├─ Graceful "ComfyUI not configured" for execute/status/queue
├─ README + MCP-SETUP: new tools, COMFYUI_HOST
├─ Tests for new MCP tools (mocked client)
└─ Optional: E2E with real ComfyUI
```

**Deliverables:**
- ✅ 4 new MCP tools: build_workflow, execute_workflow, get_execution_status, list_queue
- ✅ MCP server works with or without ComfyUI (read-only tools always; execute when COMFYUI_HOST set)
- ✅ Documentation updated
- ✅ Tests for new tools

---

### 🌟 Phase 8: Optional — Save/Load & More (Month 2+)

**Goal:** Persist workflows, more templates, better UX.

```
Month 2: Optional features
├─ save_workflow / list_saved_workflows / load_workflow
├─ Templates: img2img, inpainting (if needed)
├─ doc/workflow-builder.md (templates, params, format)
└─ npm publish, CI/CD (if not done earlier)
```

**Deliverables:**
- ✅ Optional save/load workflows
- ✅ More templates (img2img, etc.)
- ✅ Published package, CI/CD

---

## 📊 Progress Tracking

### Implementation Status

```
Knowledge base + 4 MCP tools   [████████████████████] 100% ✅
ComfyUI client + builder      [░░░░░░░░░░░░░░░░░░░░]   0%
MCP build/execute/status      [░░░░░░░░░░░░░░░░░░░░]   0%
Save/load + more templates    [░░░░░░░░░░░░░░░░░░░░]   0%
```

### Feature Roadmap

| Feature | Status | Priority | ETA |
|---------|--------|----------|-----|
| Seed knowledge base | ✅ Done | P0 | — |
| MCP: list, get_info, check, suggest | ✅ Done | P0 | — |
| ComfyUI API client | 🔄 Planned | P1 | Phase 6 |
| Workflow builder (template → JSON) | 🔄 Planned | P1 | Phase 6 |
| MCP: build_workflow | 🔄 Planned | P1 | Phase 7 |
| MCP: execute_workflow | 🔄 Planned | P1 | Phase 7 |
| MCP: get_execution_status | 🔄 Planned | P1 | Phase 7 |
| MCP: list_queue | 🔄 Planned | P1 | Phase 7 |
| Save/load workflows | 📋 Backlog | P2 | Phase 8 |
| More templates (img2img, etc.) | 📋 Backlog | P2 | Phase 8 |
| npm publish, CI/CD | 📋 Backlog | P2 | Phase 8 |

**Legend:** ✅ Done | 🔄 Planned | 📋 Backlog

---

## 🎯 Milestones

### Milestone 1: Knowledge MCP ✅
- Seed-based knowledge, 4 read-only MCP tools, tests, docs.

### Milestone 2: Workflow Builder (v0.2.0)
- ComfyUI client + workflow builder (template → JSON).
- MCP: build_workflow, execute_workflow, get_execution_status, list_queue.
- Works like n8n-workflow-builder but for ComfyUI.

### Milestone 3: v0.3.0 (optional)
- Save/load workflows, more templates, npm publish, CI/CD.

---

## 🔗 Quick Links

- **Detailed plan:** [NEXT-STEPS.md](NEXT-STEPS.md)
- **Tasks:** [TODO.md](TODO.md)
- **ComfyUI API:** [doc/comfyui-api-quick-reference.md](doc/comfyui-api-quick-reference.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Roadmap v2.0 | Workflow Builder focus | 2026-02-01*
