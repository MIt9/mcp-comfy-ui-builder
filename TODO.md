# ✅ TODO List

> Quick actionable tasks for next development session

**Last Updated:** 2025-02-01

---

## 🔥 Today (2-4 hours)

### Critical: Verify Implementation

- [x] **Check if code exists and works**
  ```bash
  # Test each command
  npm run build   # ✅ OK
  npm test        # ✅ 26 tests pass
  npm run scan:dry # ✅ OK (dry-run)
  npm run add-node # interactive — test manually in Cursor
  ```

- [x] **Review core files**
  - [x] `src/node-discovery/scanner.ts` — scanLiveInstance, fetchManagerList, analyzeRepository, findNewNodes
  - [x] `src/node-discovery/ai-generator.ts` — buildPrompt, extractJson, generateDescription (Claude)
  - [x] `src/node-discovery/updater.ts` — addNode, updateCompatibility, generateChangelog
  - [x] `src/mcp-server.ts` — list_node_types, get_node_info, check_compatibility, suggest_nodes

- [ ] **Test MCP server**
  ```bash
  npm run build
  npm run mcp
  # Then test in Cursor
  ```

### Fill Knowledge Base

- [ ] **Setup environment**
  ```bash
  cp .env.example .env
  # Edit .env: add ANTHROPIC_API_KEY
  ```

- [ ] **Run initial scan**
  ```bash
  # Start ComfyUI first
  npm run scan
  # Check knowledge/base-nodes.json
  ```

---

## 📦 This Week (4-6 hours)

### Package Preparation

- [x] **Update package.json**
  - [x] Add repository URL (replace `your-username` with real GitHub username)
  - [ ] Add author name
  - [x] Add homepage, bugs URLs
  - [x] Add `files` field

- [x] **Add missing files**
  - [x] Create LICENSE file (MIT)
  - [x] Create .npmignore
  - [x] Test with `npm pack` (dry-run OK, 37 files)

### Error Handling

- [ ] **Add validation**
  - [ ] Check ComfyUI is running before scan
  - [ ] Validate ANTHROPIC_API_KEY format
  - [ ] Handle API errors gracefully

- [ ] **Improve error messages**
  - [ ] Clear messages for common errors
  - [ ] Add suggestions for fixes

---

## 🚀 Next Week (2-3 hours)

### Publication

- [ ] **Pre-publish**
  - [ ] Run all tests: `npm test`
  - [ ] Build: `npm run build`
  - [ ] Test locally: `npm link`

- [ ] **Publish**
  - [ ] `npm login`
  - [ ] `npm publish`
  - [ ] Test install: `npm i -g mcp-comfy-ui-builder`

### GitHub Setup

- [ ] **Repository**
  - [ ] Add description and topics
  - [ ] Add badges to README
  - [ ] Create CONTRIBUTING.md

- [ ] **GitHub Actions (optional)**
  - [ ] Test workflow on push
  - [ ] Build verification

---

## 💡 Future Ideas (Backlog)

- [ ] Add more MCP tools (search, validate, generate)
- [ ] Create web interface for browsing nodes
- [ ] Docker support
- [ ] Scheduled updates (cron)
- [ ] Plugin system
- [ ] AI workflow generation

---

## 🐛 Known Issues

*(Add issues as you find them)*

- [ ] ...

---

## 📝 Notes

- See [NEXT-STEPS.md](NEXT-STEPS.md) for detailed plan
- See [ROADMAP.md](ROADMAP.md) for visual timeline
- See [doc/README.md](doc/README.md) for documentation

---

**Quick Start:**
1. Verify code works: `npm test && npm run scan:dry`
2. Fill knowledge base: Setup .env → `npm run scan`
3. Prepare package: Update package.json, add LICENSE
4. Publish: `npm publish`
