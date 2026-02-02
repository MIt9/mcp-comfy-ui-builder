# ✅ TODO List

> Workflow Builder plan (like @makafeli/n8n-workflow-builder for ComfyUI)

**Last Updated:** 2026-02-02
**Status:** v0.5.0 released. Core + IMPROVEMENT-PLAN Phases 1–9 done ✅. Detailed plan — [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md).

---

## ✅ Completed Phases (v0.1.0 - v0.5.0)

Detailed description → [CHANGELOG.md](CHANGELOG.md)

- **Phase 1–8** — Core MCP server, workflow builder, execution, save/load, WebSocket ✅
- **IMPROVEMENT-PLAN Phase 1–6** — Templates, dynamic builder, discovery, execution, models, composition ✅
- **IMPROVEMENT-PLAN Phase 7** — Docker testing, image `siniidrozd/mcp-comfy-ui-builder:0.5.0` ✅
- **IMPROVEMENT-PLAN Phase 8** — WebSocket support ✅
- **IMPROVEMENT-PLAN Phase 9** — Knowledge Base expansion, sync-nodes, sync on MCP startup ✅

**Current capabilities:**
- 50+ MCP tools
- 8 workflow templates
- Dynamic workflow builder
- Batch and chain execution (WebSocket-optimized)
- Model management
- Plugin system
- 62 seed nodes + sync from ComfyUI (100–600+ after sync-nodes)
- CLI: seed, sync-manager, sync-nodes (including daemon --interval)

---

## 🚀 Next Steps (Phase 7+)

Detailed plan → [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md)

### High priority

#### Docker Testing & Publishing
- [x] Test Docker build locally ✅
- [x] Publish image: `siniidrozd/mcp-comfy-ui-builder:0.5.0` ✅
- [ ] CI/CD for automated image publishing

#### WebSocket Support (Phase 8)
- [x] ComfyUI WebSocket client ✅
- [x] Real-time progress, streaming API, MCP improvements ✅

#### Knowledge Base Expansion (Phase 9)
- [x] 62 seed nodes, 26 packs, WAS/KJNodes full definitions ✅
- [x] CLI `sync-nodes`, sync on MCP startup ✅
- [ ] Node usage statistics (optional)

### Medium priority

#### Plugin System Extensions (Phase 7.2)
- [ ] Plugin marketplace catalog
- [ ] MCP tool `install_plugin(url)`
- [ ] Plugin dependencies
- [ ] Versioning and compatibility

#### Quality of Life (Phase 10)
- [ ] Workflow validation improvements
- [ ] Template improvements (inheritance, conditional params)
- [ ] Workflow optimization tools
- [ ] Export/Import improvements

---

## 📦 Publication & Distribution

### npm
- [x] `npm publish` v0.4.0 ✅
- [ ] Test global install: `npm i -g mcp-comfy-ui-builder` (optional)

### GitHub
- [ ] Update repository description
- [ ] Add topics/keywords
- [ ] GitHub Releases for versions

### Docker
- [x] Publish to Docker Hub (`siniidrozd/mcp-comfy-ui-builder`) ✅

---

## 📝 Links

- **Future plans:** [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) — Phases 7-10
- **Changelog:** [CHANGELOG.md](CHANGELOG.md) — Version history
- **Timeline:** [ROADMAP.md](ROADMAP.md) — Development roadmap
- **ComfyUI API:** [doc/comfyui-api-quick-reference.md](doc/comfyui-api-quick-reference.md)
- **Documentation:** [doc/INDEX.md](doc/INDEX.md) — Full documentation index

---

## 🚀 Quick Start

```bash
# Build and seed knowledge base
npm test && npm run build

# Start MCP server
npm run mcp

# Optional: set ComfyUI connection
export COMFYUI_HOST=http://127.0.0.1:8188
export COMFYUI_PATH=/path/to/ComfyUI
```

**Available capabilities:**
- 50+ MCP tools for workflow building, execution, and management
- Knowledge base: 62 seed nodes + sync from ComfyUI (works without ComfyUI for suggest/build)
- 8 workflow templates
- Dynamic workflow builder
- Model management
- Plugin system

---

*Last updated: 2026-02-02*
