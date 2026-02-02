# 🗺️ Project Roadmap

> mcp-comfy-ui-builder: from **knowledge-only** MCP to **workflow builder** (like @makafeli/n8n-workflow-builder for ComfyUI)

---

## 📍 Current Position: Workflow Builder + Execute + Save/Load ✅

```
┌─────────────────────────────────────────────────────────────┐
│  Knowledge base + Workflow Builder: DONE ✅                  │
│  ├─ Seed knowledge base (no ComfyUI/API)                    │
│  ├─ MCP: list_node_types, get_node_info, check_compatibility│
│  │       suggest_nodes, list_templates, build_workflow       │
│  ├─ ComfyUI client: submit, history, queue                   │
│  ├─ MCP: execute_workflow, get_execution_status, list_queue │
│  ├─ Save/load: save_workflow, list_saved_workflows, load_workflow │
│  └─ Docs (README, doc/, workflow-builder.md)                 │
└─────────────────────────────────────────────────────────────┘
```

**Далі:** Розширення шаблонів, Dynamic Builder, Execution/Discovery покращення — згідно **[IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md)**.

---

## 🎯 Roadmap Timeline

### ✅ Phase 6–7: Workflow Builder & MCP Tools (Done)

- ComfyUI client (submit, history, queue), workflow builder (txt2img), MCP: build_workflow, execute_workflow, get_execution_status, list_queue, save/load workflows, docs.

### ✅ Phase 8: Save/Load & Docs (Done)

- save_workflow, list_saved_workflows, load_workflow; doc/workflow-builder.md.

---

### 📐 Далі: IMPROVEMENT-PLAN (6 фаз)

Детальний план — **[IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md)**. Короткий огляд:

| Фаза | Назва | Ключові deliverables |
|------|--------|----------------------|
| **1** | Розширення шаблонів | Inpainting, Upscaling, LoRA, ControlNet, Batch templates; base-nodes + workflow-builder |
| **2** | Dynamic Workflow Builder | dynamic-builder.ts, workflow-store.ts; MCP: create_workflow, add_node, connect_nodes, … |
| **3** | Node Discovery Enhancement | getObjectInfo, hybrid-discovery.ts; MCP: discover_nodes_live, search_nodes, sync_nodes_to_knowledge |
| **4** | Execution Improvements | comfyui-ws-client.ts, batch-executor, output-manager; execute_workflow_sync, execute_batch, list_outputs |
| **5** | Model Management | model-manager.ts; list_models, get_workflow_models, check_workflow_models |
| **6** | Workflow Composition | workflow-template, macro, chainer; create_template, insert_macro, execute_chain |

**Порядок:** Фаза 1 → Фаза 2 (і паралельно Фаза 3) → Фаза 4 (і паралельно Фаза 5) → Фаза 6.

---

## 📊 Progress Tracking

### Implementation Status

```
Knowledge base + 4 MCP tools   [████████████████████] 100% ✅
ComfyUI client + builder      [████████████████████] 100% ✅
MCP build/execute/status       [████████████████████] 100% ✅
Save/load + docs               [████████████████████] 100% ✅
IMPROVEMENT-PLAN Phase 1       [████████████████████] 100% ✅
IMPROVEMENT-PLAN Phase 2       [████████████████████] 100% ✅
IMPROVEMENT-PLAN Phase 3       [████████████████████] 100% ✅
IMPROVEMENT-PLAN Phases 4–6   [░░░░░░░░░░░░░░░░░░░░]   0% (next)
```

### Feature Roadmap

| Feature | Status | Priority | ETA |
|---------|--------|----------|-----|
| Seed knowledge base | ✅ Done | P0 | — |
| MCP: list, get_info, check, suggest | ✅ Done | P0 | — |
| ComfyUI API client | ✅ Done | P1 | — |
| Workflow builder (txt2img) | ✅ Done | P1 | — |
| MCP: build_workflow, execute_workflow, status, list_queue | ✅ Done | P1 | — |
| Save/load workflows | ✅ Done | P2 | — |
| **IMPROVEMENT-PLAN: Phase 1 templates** (inpainting, upscale, lora, controlnet, batch) | ✅ Done | P1 | — |
| **IMPROVEMENT-PLAN: Phase 2** Dynamic Builder | ✅ Done | P2 | — |
| **IMPROVEMENT-PLAN: Phase 3** Node Discovery (getObjectInfo, hybrid-discovery, discover/search/sync) | ✅ Done | P2 | — |
| **IMPROVEMENT-PLAN: Phases 4–6** Execution, Models, Composition | 🔄 Next | P2 | Phases 4–6 |

**Legend:** ✅ Done | 🔄 Next | 📋 Backlog

---

## 🎯 Milestones

### Milestone 1: Knowledge MCP ✅
- Seed-based knowledge, 4 read-only MCP tools, tests, docs.

### Milestone 2: Workflow Builder (v0.2.0) ✅
- ComfyUI client + workflow builder (template → JSON).
- MCP: build_workflow, execute_workflow, get_execution_status, list_queue.
- Save/load workflows. Works like n8n-workflow-builder but for ComfyUI.

### Milestone 3: v0.3.0 (IMPROVEMENT-PLAN Phase 1)
- More templates: inpainting, upscaling, LoRA, ControlNet, batch.

### Milestone 4: v0.4.0+ (IMPROVEMENT-PLAN Phases 2–6)
- Dynamic workflow builder, hybrid discovery, WebSocket execution, model manager, workflow composition.

---

## 🔗 Quick Links

- **План покращень (6 фаз):** [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md)
- **Детальний план:** [NEXT-STEPS.md](NEXT-STEPS.md)
- **Задачі:** [TODO.md](TODO.md)
- **ComfyUI API:** [doc/comfyui-api-quick-reference.md](doc/comfyui-api-quick-reference.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Roadmap v2.1 | Phase 6–8 done; IMPROVEMENT-PLAN next | 2026-02-02*
