# MCP ComfyUI Builder - Improvement Plan

Detailed plan for future improvements to maximize image generation convenience.

**Completed phases (1-6)** → see [CHANGELOG.md](CHANGELOG.md) versions 0.3.0 and 0.4.0.

---

## Current Project State (v0.4.0)

| Component | Current | Target |
|-----------|---------|--------|
| MCP tools | 40+ | 45+ |
| Workflow templates | 8 | 10+ |
| Nodes in knowledge base | 55 | 100+ |
| Execution | Polling | WebSocket + Polling |
| Workflow building | Templates + Dynamic API | ✅ Done |
| Plugin System | Data-only | ✅ Done |
| Docker | Dockerfile ready | Needs testing |

---

## ✅ Completed Phases

- **Phase 1:** Extended templates (inpainting, upscale, lora, controlnet, batch) — v0.3.0
- **Phase 2:** Dynamic Workflow Builder API — v0.3.0
- **Phase 3:** Node Discovery Enhancement (hybrid discovery, live sync) — v0.3.0
- **Phase 4:** Execution Improvements (batch, chaining, output management) — v0.3.0
- **Phase 5:** Model Management — v0.3.0
- **Phase 6:** Workflow Composition (templates, macros, chaining) — v0.4.0

Detailed description → [CHANGELOG.md](CHANGELOG.md)

---

## 🔮 Future Plans

### Phase 7: Docker and Plugin System Extensions

#### 7.1 Docker Testing and Publishing

**Status:** ✅ Docker build tested locally and in CI. Ready for publishing.

**Tasks:**
- [x] Test Docker build locally (`npm run test:docker`) ✅
- [x] Test docker-compose build ✅
- [ ] Test docker-compose stack with ComfyUI (`docker compose -f docker-compose.example.yml up` — optional)
- [x] Publish image to Docker Hub (`siniidrozd/mcp-comfy-ui-builder:0.5.0`) ✅
- [x] Update doc/DOCKER-SETUP.md with real examples and Testing section
- [x] Add CI job for Docker build (`.github/workflows/ci.yml`)

**Files:**
- ✅ `Dockerfile` — ready (multi-stage build)
- ✅ `docker-compose.example.yml` — ready
- ✅ `doc/DOCKER-SETUP.md` — ready
- [x] `scripts/test-docker.sh` — local test (build + verify + compose build)
- [ ] `.github/workflows/docker-publish.yml` — CI/CD for image publishing (optional)

#### 7.2 Plugin System Extensions

**Status:** Base plugin system implemented (v0.4.0), extensions can be added.

**Possible extensions:**
- [ ] **Plugin marketplace** — community plugins catalog
- [ ] **MCP tool for installation** — `install_plugin(url)` from GitHub
- [ ] **Plugin dependencies** — dependencies between plugins
- [ ] **Versioning** — version compatibility checking
- [ ] **Custom node presets** — plugins with recommendations for installing custom nodes
- [ ] **Workflow collections** — packages of ready workflows from the community

**Current implementation (v0.4.0):**
- ✅ Data-only plugin system with JSON schemas
- ✅ Plugin loader with validation
- ✅ Macro registry
- ✅ MCP tools: list_plugins, reload_plugins
- ✅ Example plugin included

### Phase 8: WebSocket Support

**Goal:** Real-time execution with instant feedback via WebSocket.

**Tasks:**
- [ ] **ComfyUI WebSocket client** (`src/comfyui-ws-client.ts`)
  - Connection to ComfyUI WebSocket API
  - Real-time progress tracking
  - Node-level execution callbacks
- [ ] **Streaming execution API**
  - `execute_workflow_stream` — streaming updates via MCP
  - Progress events with current_node, progress%, queue_position
- [ ] **MCP improvements**
  - `get_execution_progress` with real-time data (not polling)
  - `interrupt_execution` — stop execution

**Benefits:**
- Instant feedback during generation
- Reduced load (no polling)
- Detailed information about each node's progress

---

### Phase 9: Knowledge Base Expansion

**Goal:** Expand knowledge base to 100+ nodes.

**Tasks:**
- [x] Add popular custom node packs to knowledge base ✅ (55 nodes, 26 packs)
  - [x] Essential nodes (Impact Pack, IPAdapter, AnimateDiff, VideoHelperSuite, BLIP, rgthree)
  - [x] 10 new packs (Inspire, PhotoMaker, SUPIR, Comfyroll, Refacer, ttN, Plus, etc.)
- [x] Automate knowledge base updates ✅
  - [x] CLI `sync-nodes` — sync from ComfyUI object_info (one-shot or daemon `--interval N`)
  - [x] `sync-manager` — sync custom-node-list from ComfyUI-Manager
  - [x] Sync on MCP startup — background sync from ComfyUI object_info ✅
- [ ] Node usage statistics
  - Tracking most popular nodes
  - Recommendations based on statistics
- [ ] Advanced compatibility checking
  - Type inference for complex types
  - Automatic conversion suggestions

---

### Phase 10: Quality of Life Features

**Goal:** Improve user experience.

**Possible features:**
- [ ] **Workflow validation improvements**
  - More detailed errors
  - Fix suggestions
  - Visual graph validation
- [ ] **Template improvements**
  - Template inheritance
  - Conditional parameters
  - Parameter validation rules
- [ ] **Workflow optimization**
  - Automatic node deduplication
  - Unused node removal
  - Performance suggestions
- [ ] **Export/Import**
  - Export workflow as ComfyUI-compatible JSON
  - Import ComfyUI workflows
  - Workflow sharing formats
- [ ] **Better documentation**
  - Interactive examples
  - Video tutorials
  - API playground

---

## Development Priorities

### High priority
1. **Docker testing** (Phase 7.1) — files ready, needs testing
2. **WebSocket support** (Phase 8) — significant UX improvement
3. **Knowledge base expansion** (Phase 9) — more nodes = more capabilities

### Medium priority
4. **Plugin marketplace** (Phase 7.2) — community contributions
5. **Workflow validation improvements** (Phase 10) — better developer experience
6. **Template improvements** (Phase 10) — more flexibility

### Low priority
7. **Plugin dependencies** (Phase 7.2) — nice to have
8. **Node usage statistics** (Phase 9) — analytics
9. **Export/Import** (Phase 10) — additional formats

---

## How to Contribute

Detailed description of completed phases → [CHANGELOG.md](CHANGELOG.md)

To add new features:
1. Create an issue with feature description
2. Discuss approach with maintainers
3. Implement with tests
4. Update documentation
5. Create PR

---

*Last updated: 2026-02-02*
