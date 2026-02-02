# Changelog — mcp-comfy-ui-builder

Project change history. Knowledge base (nodes) → [knowledge/CHANGELOG.md](knowledge/CHANGELOG.md).

---

## [0.2.0] – 2026-02-02

### Added

- **install_custom_node(node_names, channel?, mode?)** — install custom node packs via ComfyUI-Manager cm-cli (requires COMFYUI_PATH).
- **install_model(url, model_type?)** — download model/LoRA/VAE/controlnet/etc. by URL to ComfyUI models folder (requires COMFYUI_PATH); uses comfy-cli if in PATH, else direct fetch.
- **manager-cli.ts** — run cm-cli (custom nodes), comfy model download, and direct model fetch; getComfyPath, getRelativePathForModelType, MODEL_TYPE_PATHS.
- **Doc:** [INSTALL-NODES-AND-MODELS.md](doc/INSTALL-NODES-AND-MODELS.md) — COMFYUI_PATH, install flow, model types.

### Changed

- MCP-SETUP.md: install_custom_node, install_model in tools table; COMFYUI_PATH note. INDEX: link to INSTALL-NODES-AND-MODELS.

---

## [0.1.3] – 2026-02-02

### Added

- **Generate-and-verify pipeline:** `prepare_image_for_workflow(prompt_id)` — fetch first output image from a run and upload to ComfyUI input for follow-up workflows (e.g. image caption / verification).
- **Template `image_caption`:** LoadImage → BLIPCaption for image-to-text; requires custom node pack (ComfyUI-Blip, comfyui-art-venture, or img2txt-comfyui-nodes).
- **Doc:** [GENERATE-AND-VERIFY.md](doc/GENERATE-AND-VERIFY.md) — flow: generate → get image → verify (caption in ComfyUI or external Vision API) → compare to expectation.
- **ComfyUI client:** `fetchOutputImageBytes`, `uploadImage`, `prepareImageForWorkflow`; `getFirstOutputImageRef`.
- **get_execution_status:** now returns text outputs from nodes (e.g. BLIP caption) when present.
- **Knowledge:** ComfyUI-Blip pack in custom-nodes.json.

### Changed

- workflow-builder.md: image_caption template; INDEX link to GENERATE-AND-VERIFY.

---

## [0.1.2] – 2026-02-02

### Changed

- Documentation: README, INDEX, MCP-SETUP, AI-ASSISTANT-GUIDE, comfyui-api-quick-reference.
- ComfyUI client, MCP server; related tests updated.

---

## [0.1.1] – 2026-02-02

### Added

- **AI Assistant Guide** (doc/AI-ASSISTANT-GUIDE.md) — guidance for AI assistants using the MCP server.
- **Project Insights** (doc/PROJECT-INSIGHTS.md) — project context and architecture notes.

### Changed

- Documentation: INDEX, MCP-SETUP, workflow-builder, README, NEXT-STEPS, TODO.
- ComfyUI client, MCP server, workflow builder; related tests updated.

---

## [0.1.0] – 2026-02-01

### Added

- **Phases 1–4:** scaffold, core (scanner, ai-generator, updater), CLI (scan, sync-manager, analyze, add-node), MCP server (list_node_types, get_node_info, check_compatibility, suggest_nodes).
- **Phase 5:** tests (vitest: scanner, ai-generator, updater, mcp-tools, integration scan), logger ([scan]/[mcp]/[cli]), CLI error handling, rate limiting (retry/backoff in scanner, delays in generateBatch), doc updates.
- **Phase 6:** single MCP launch instruction (`npm run mcp`), Cursor config example (`examples/cursor-mcp.json`), root CHANGELOG, Troubleshooting section in MCP-SETUP.
- Documentation: doc/README.md (task-based navigation), simplified INDEX, single source of truth for knowledge base (knowledge/ at root).

### Technical

- Node 18+, TypeScript, ESM.
- Dependencies: @anthropic-ai/sdk, @modelcontextprotocol/sdk, commander, node-fetch, zod; dev: vitest, tsx.

---

*Format: [SemVer] – Date. Project: MVP ready (phases 1–6).*
