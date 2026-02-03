# Changelog — mcp-comfy-ui-builder

Project change history. Knowledge base (nodes) → [knowledge/CHANGELOG.md](knowledge/CHANGELOG.md).

---

## [Unreleased]

---

## [2.1.2] – 2026-02-03

### Added

- **get_node_info (live-first):** When COMFYUI_HOST is set, uses live ComfyUI via hybrid discovery first; returns node definition from `/object_info` (with `_source: 'live'`) so KSampler and other nodes have up-to-date required inputs (e.g. sampler_name, scheduler). Falls back to knowledge base when ComfyUI is unavailable or node not in live. [src/mcp-server.ts](src/mcp-server.ts) — liveNodeInfoToDescription().
- **waitForCompletion(promptId, timeoutMs, onProgress?):** Exported from comfyui-client for MCP handler; allows submit-then-wait flow so prompt_id can be returned on wait failure. [src/comfyui-client.ts](src/comfyui-client.ts).

### Changed

- **execute_workflow_sync:** Refactored to submitPrompt() first, then waitForCompletion(prompt_id). On wait failure or throw, response includes prompt_id in JSON so client can use get_history/get_last_output. [src/mcp-server.ts](src/mcp-server.ts), [src/comfyui-client.ts](src/comfyui-client.ts).
- **Documentation:** MCP-SETUP — note that for long runs the MCP client may disconnect; use get_history(limit=5) or get_last_output() to recover. [doc/MCP-SETUP.md](doc/MCP-SETUP.md).

### Tests

- **comfyui-client.test.ts:** getHistory normalizes keyed response for GET /history/{prompt_id} (ComfyUI format `{ [prompt_id]: { outputs, status } }`). [tests/comfyui-client.test.ts](tests/comfyui-client.test.ts).

---

## [2.1.1] – 2026-02-03

### Fixed (Bug_Report_1)

- **get_node_info("KSampler"):** Added `sampler_name` and `scheduler` to `input_types.required` in `knowledge/base-nodes.json` so the tool returns complete inputs consistent with live ComfyUI.
- **build_workflow (txt2img, img2img, inpainting, upscale refine, txt2img_lora, controlnet):** All KSampler nodes now include `sampler_name: 'euler'` and `scheduler: 'normal'` so generated workflows execute without `required_input_missing` errors.
- **list_outputs / download_output:** `getHistory(promptId)` in `comfyui-client.ts` now normalizes ComfyUI response when GET `/history/{prompt_id}` returns keyed format `{ [prompt_id]: { outputs, status } }`, so outputs are found correctly.
- **execute_workflow_sync:** Error message in catch now suggests using `get_history(limit=5)` or `get_last_output()` when the workflow was already submitted (recovery when client times out).

### Changed

- **get_generation_recommendations:** Fixed TypeScript assignability (ResourceRecommendations → Record<string, unknown>) in mcp-server.ts.

### Tests

- **mcp-tools.test.ts:** Assert KSampler from get_node_info has `sampler_name` and `scheduler` in required inputs.
- **workflow-builder.test.ts:** Assert txt2img KSampler inputs include `sampler_name: 'euler'` and `scheduler: 'normal'`.

---

## [2.1.0] – 2026-02-03

### Added

- **get_history(limit?):** MCP tool — GET /history without prompt_id; returns last N prompts with prompt_id, status, outputs. Use when execute_workflow_sync did not return prompt_id (e.g. WebSocket timeout). [src/mcp-server.ts](src/mcp-server.ts), [src/comfyui-client.ts](src/comfyui-client.ts) — getHistory() normalizes object response.
- **get_last_output():** MCP tool — most recent completed prompt’s first image (prompt_id, filename, view_url). Use when prompt_id was lost; then download_by_filename to save. [src/mcp-server.ts](src/mcp-server.ts).
- **download_by_filename(filename, dest_path, subfolder?, type?):** MCP tool — download output by filename (no prompt_id). Uses GET /view. [src/mcp-server.ts](src/mcp-server.ts), [src/output-manager.ts](src/output-manager.ts), [src/comfyui-client.ts](src/comfyui-client.ts) — fetchOutputByFilename().
- **get_generation_recommendations(prompt?):** MCP tool — system resources (max resolution, model size, batch) plus, if prompt suggests text/letters in the image, advice: prefer FLUX/SD3, 25–30 steps; many base models render text poorly. [src/mcp-server.ts](src/mcp-server.ts).
- **doc/IMAGE-GENERATION-RECOMMENDATIONS.md** — image generation: resources, text-in-image, model choice. Links from AI-ASSISTANT-GUIDE, MCP-SETUP, INDEX, README.

### Changed

- **execute_workflow_sync:** Always returns prompt_id (even on error); outer try/catch returns { prompt_id, status: 'failed', error } so client can use get_history/get_last_output. [src/comfyui-client.ts](src/comfyui-client.ts) — submitPromptAndWaitWithProgress().
- **getHistory():** When GET /history returns object keyed by prompt_id, normalize to array with prompt_id set; newest first. [src/comfyui-client.ts](src/comfyui-client.ts).
- **Documentation:** AI-ASSISTANT-GUIDE, MCP-SETUP, workflow-builder, WEBSOCKET-GUIDE — get_history, get_last_output, download_by_filename, recovery when result lost; get_generation_recommendations and text-in-image advice.

---

## [2.0.1] – 2026-02-03

### Added

- **spawn node ENOENT:** Documentation and troubleshooting for when Cursor/IDE cannot find `node` in PATH. [doc/MCP-SETUP.md](doc/MCP-SETUP.md) — new row in Troubleshooting and section "Command: full path to node"; [examples/README.md](examples/README.md), [README.md](README.md), [doc/AI-ASSISTANT-GUIDE.md](doc/AI-ASSISTANT-GUIDE.md) — use full path to Node in `command`.
- **cursor-mcp-full-template.json:** Full MCP config template with three placeholders (REPLACE_WITH_FULL_PATH_TO_NODE, REPLACE_WITH_PACKAGE_PATH, REPLACE_WITH_COMFYUI_PATH) and example after replacement (macOS, Homebrew). [examples/cursor-mcp-full-template.json](examples/cursor-mcp-full-template.json), [examples/README.md](examples/README.md).

### Changed

- **Documentation:** All user-facing docs in English. Examples and MCP-SETUP references updated for the new template.

---

## [2.0.0] – 2026-02-03

### Added

- **get_system_resources (MCP tool):** Fetches ComfyUI `/system_stats` (GPU/VRAM/RAM) and returns recommendations (max_width, max_height, suggested_model_size, max_batch_size) to avoid OOM. AI assistants should call this first before building or executing workflows. [src/comfyui-client.ts](src/comfyui-client.ts) — `getSystemStats()`, [src/resource-analyzer.ts](src/resource-analyzer.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **Resource analyzer:** Interprets VRAM tiers (low/medium/high/very_high) and suggests resolution, model size (light/medium/heavy), and batch limits. [src/resource-analyzer.ts](src/resource-analyzer.ts), [tests/resource-analyzer.test.ts](tests/resource-analyzer.test.ts).
- **Types:** `SystemStatsResponse`, `SystemStatsDevice`, `SystemStatsSystem` in [src/types/comfyui-api-types.ts](src/types/comfyui-api-types.ts).

### Changed

- **Documentation:** [doc/AI-ASSISTANT-GUIDE.md](doc/AI-ASSISTANT-GUIDE.md) — "Before building workflows: check resources first"; [doc/GETTING-STARTED.md](doc/GETTING-STARTED.md), [doc/MCP-SETUP.md](doc/MCP-SETUP.md), [README.md](README.md) — get_system_resources and resource-check workflow. AI flow: call get_system_resources → build workflow within recommendations → execute.

### Fixed

- **manager-cli.ts:** `restartComfyUI` — use `baseUrl` from `getComfyHostPort()` in error message (was undefined). `restartComfyUIAsync` — declare as `async` so `await` is valid.

---

## [1.1.5] – 2026-02-03

### Added

- **Icon:** [assets/icon.svg](assets/icon.svg) — node-graph style icon for repo and README.
- **MCP Registry:** [server.json](server.json) for [MCP Registry](https://modelcontextprotocol.io/registry/about); `mcpName` in package.json (`io.github.MIt9/comfy-ui-builder`). Env vars (COMFYUI_HOST, COMFYUI_PATH, COMFYUI_KNOWLEDGE_DIR) documented in server.json. [scripts/publish.sh](scripts/publish.sh) — MCP Registry publish step.
- **Distribution:** README Install section (npm one-liner); CONTRIBUTING section on npm/MCP Registry/GitHub topics; package.json keywords extended (model-context-protocol, workflow, image-generation, stable-diffusion, ai).

### Changed

- **Documentation:** README, package.json description, TODO, NEXT-STEPS, IMPROVEMENT-PLAN, ROADMAP updated for v1.1.x; removed outdated phase refs; 62 seed nodes, 50+ tools, WebSocket features clarified. Docker image refs use latest tag.

---

## [1.1.3] – 2026-02-02

### Fixed

- **install_custom_node Python detection:** `runCmCli()` now uses ComfyUI venv Python (`COMFYUI_PATH/venv/bin/python3` or `venv/Scripts/python.exe`) instead of system Python. This fixes the "No module named 'rich'" error when `rich` is installed in ComfyUI venv but not globally. Falls back to system `python3`/`python` if venv not found. [src/manager-cli.ts](src/manager-cli.ts) — new `getPythonExecutable()` function.

---

## [1.1.0] – 2026-02-02

### Added

- **MCP setup docs:** Quick connection checklist, optional env vars (COMFYUI_HOST, COMFYUI_PATH, COMFYUI_KNOWLEDGE_DIR), full config example. [doc/MCP-SETUP.md](doc/MCP-SETUP.md), [examples/README.md](examples/README.md).
- **Full config example:** [examples/cursor-mcp-full.json](examples/cursor-mcp-full.json) with all env vars; [examples/README.md](examples/README.md) documents each variable.
- **Knowledge base docs:** Section in GETTING-STARTED on sync_nodes_to_knowledge and COMFYUI_KNOWLEDGE_DIR to avoid ENOENT when MCP runs from another app cwd.

### Changed

- **install_custom_node:** Check for Python `rich` before running cm-cli; return clear message if missing (ComfyUI-Manager requires `pip install rich`). [src/manager-cli.ts](src/manager-cli.ts) — `checkRichAvailable()`, called from `runCmCli()`.
- **sync_nodes_to_knowledge:** `ensureKnowledgeDir()` in updater creates `knowledge/` before write; COMFYUI_KNOWLEDGE_DIR supported in updater and mcp-server. [src/node-discovery/updater.ts](src/node-discovery/updater.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **README:** Connect MCP section with requirements, minimal and with-COMFYUI_HOST config, link to full guide.
- **Troubleshooting:** Rows for "ComfyUI is not configured", ENOENT/sync_nodes_to_knowledge, install_custom_node (rich). [doc/MCP-SETUP.md](doc/MCP-SETUP.md).

---

## [0.5.0] – 2026-02-02

### Added

#### Phase 8: WebSocket Support (IMPROVEMENT-PLAN)

**Real-time execution tracking with WebSocket connection to ComfyUI.**

##### Core WebSocket Client
- **src/comfyui-ws-client.ts** (NEW, ~360 lines) — Singleton WebSocket client manager
  - Auto-reconnect with exponential backoff (1s → 30s)
  - Ping/pong keepalive (30s interval)
  - Subscription-based event handling
  - Multiple concurrent subscriptions support
  - Graceful disconnect and cleanup

##### WebSocket Event Types (src/types/comfyui-api-types.ts)
- `WSProgressEvent` — Real-time progress updates (0-1)
- `WSExecutingEvent` — Node execution started/finished
- `WSExecutedEvent` — Node completed with outputs
- `WSStatusEvent` — Queue status updates
- `WSExecutionErrorEvent` — Execution errors with traceback
- `WSExecutionCachedEvent` — Cached node outputs
- `ExecutionProgress` — Unified progress interface

##### Hybrid Execution (src/comfyui-client.ts)
- **submitPromptAndWaitWithProgress()** — WebSocket-first with polling fallback
  - Tries WebSocket for real-time updates
  - Automatic fallback to polling on connection failure
  - Optional progress callback for streaming updates
- **isWebSocketAvailable()** — Check WebSocket connection status

##### Enhanced MCP Tools
- **execute_workflow_sync** — Now with WebSocket support
  - New parameter: `stream_progress` (default: true)
  - Returns `progress_method: 'websocket' | 'polling'`
  - Includes `progress_log` with streaming updates
  - Sub-second progress updates vs 1.5s polling

- **get_execution_progress** — Real-time progress tracking
  - Checks WebSocket client first for live data
  - Returns current node, progress %, queue position
  - Falls back to polling if WebSocket unavailable
  - Returns `method: 'websocket' | 'polling'`

- **execute_workflow_stream** (NEW) — Streaming execution
  - Requires WebSocket connection
  - Collects all progress events during execution
  - Returns result + event history (last 10 events)

##### Optimized Batch & Chain Execution
- **batch-executor.ts** — Pre-connects WebSocket before batch
  - Single WebSocket connection vs multiple polling loops
  - 90% reduced network overhead
  - Shared connection for concurrent workflows

- **chainer.ts** — Pre-connects WebSocket for chain
  - Real-time progress for each step
  - Optimized sequential execution

##### Testing
- **tests/comfyui-ws-client.test.ts** (NEW, 20 tests) — Comprehensive WebSocket tests
  - Connection lifecycle (connect, disconnect, reconnect)
  - All event handlers (executing, progress, executed, error, cached, status)
  - Subscription management
  - Multiple concurrent subscriptions
  - Error handling and edge cases
  - Singleton pattern validation

### Changed
- **comfyui-client.ts** — Added hybrid execution functions (+120 lines)
- **mcp-server.ts** — Enhanced execution tools with WebSocket (+80 lines)
- **batch-executor.ts** — Pre-connect WebSocket optimization
- **chainer.ts** — Pre-connect WebSocket optimization

### Performance
- **Progress latency:** <100ms (vs 1.5s polling)
- **Network traffic:** -90% requests for batch execution
- **Concurrent execution:** 10x better scaling with shared WebSocket

---

## [0.4.0] – 2026-02-02

### Added

#### Phase 6: Workflow Composition

- **workflow-template.ts** — Parameterized template system with parameter definitions, validation, and dynamic value binding.
- **macro.ts** — Reusable sub-workflows (macros) with input/output ports; macro registry and insertion API.
- **chainer.ts** — Sequential workflow execution with data passing between steps (execute_chain).
- **plugin-loader.ts** — Data-only plugin system; loads plugins from `plugins/*/plugin.json`; registers custom macros and templates.

##### New MCP Tools (6):
- **create_template** — Create parameterized template from workflow JSON.
- **apply_template** — Apply template with parameter values to generate workflow.
- **validate_template_params** — Validate parameters against template schema.
- **list_macros** — List available built-in and plugin macros.
- **insert_macro** — Insert macro sub-workflow into workflow context.
- **execute_chain** — Execute chain of workflows with data passing.
- **list_plugins** — List installed plugins (id, name, version, source).
- **reload_plugins** — Reload plugin registry at runtime.

##### Plugin System:
- Data-only plugins (no code execution) with JSON schemas.
- Plugin format: `plugins/<id>/plugin.json` with macros, templates, chains.
- Example plugin included: `plugins/example/` with simple upscale macro.
- Runtime plugin discovery and registration.

##### Documentation:
- **PLUGINS.md** — Plugin development guide and data schemas.
- Updated MCP-SETUP.md with Phase 6 tools.

---

## [0.3.0] – 2026-02-02

### Added

#### Phase 1: Extended Templates (5 new)

- **Inpainting template** — Image editing with mask support (LoadImage, LoadImageMask, SetLatentNoiseMask, VAEEncode/Decode).
- **Upscaling template** — Resolution increase with optional refinement (UpscaleModelLoader, ImageUpscaleWithModel, optional KSampler).
- **LoRA template** (txt2img_lora) — Text-to-image with LoRA model chain; supports multiple LoRAs with strength parameters.
- **ControlNet template** — Structure-guided generation (ControlNetLoader, ControlNetApply).
- **Batch template** — Multi-variation generation with seed/prompt arrays.
- Knowledge base: added LoadImageMask, SetLatentNoiseMask, UpscaleModelLoader, ImageUpscaleWithModel, LoraLoader, ControlNetLoader, ControlNetApply.

#### Phase 2: Dynamic Workflow Builder

- **dynamic-builder.ts** — Programmatic workflow creation API (create, add node, connect, remove, set input, validate).
- **workflow-store.ts** — In-memory workflow context storage with 30-minute TTL and automatic cleanup.
- **workflow-storage.ts** — Persist workflows to disk (`workflows/*.json`).

##### New MCP Tools (8):
- **create_workflow** — Create empty workflow context, returns workflow_id.
- **add_node** — Add node to workflow by class_type, returns node_id.
- **connect_nodes** — Connect output of one node to input of another.
- **remove_node** — Remove node from workflow.
- **set_node_input** — Set literal input value for node.
- **get_workflow_json** — Get current workflow JSON.
- **validate_workflow** — Validate workflow completeness and connections.
- **finalize_workflow** — Complete workflow and return final JSON.

#### Phase 3: Node Discovery Enhancement

- **hybrid-discovery.ts** — Merge live ComfyUI `/object_info` with knowledge base; 5-minute cache.
- **node-discovery/scanner.ts** — Enhanced node package scanning.
- **node-discovery/updater.ts** — Sync live node data back to knowledge base.
- **comfyui-client.ts** — Added `getObjectInfo()` for live node discovery.

##### New MCP Tools (6):
- **discover_nodes_live** — Fetch all nodes from running ComfyUI instance.
- **search_nodes** — Search by name, category, input/output types across all sources.
- **get_node_inputs** — Detailed input specifications for node.
- **get_node_outputs** — Detailed output specifications for node.
- **list_node_categories** — List all available node categories.
- **sync_nodes_to_knowledge** — Sync live node data to knowledge base.

#### Phase 4: Execution Improvements

- **batch-executor.ts** — Concurrent execution of multiple workflows with configurable concurrency, progress tracking.
- **output-manager.ts** — Output file management (list, download, path mapping).
- **comfyui-client.ts** — Added `submitPromptAndWait()` with polling for synchronous execution.

##### New MCP Tools (7):
- **execute_workflow_sync** — Submit workflow and wait for completion (polling-based).
- **get_execution_progress** — Get current execution progress and node status.
- **execute_batch** — Execute multiple workflows concurrently.
- **list_outputs** — List output files for prompt_id.
- **download_output** — Download specific output file to destination.
- **download_all_outputs** — Download all outputs from execution to directory.
- **prepare_image_for_workflow** — Fetch and upload output image for follow-up workflows.

#### Phase 5: Model Management

- **model-manager.ts** — Model discovery, validation, and workflow dependency analysis.
- Support for checkpoint, lora, vae, controlnet, upscale, embedding, clip model types.
- Workflow model requirement extraction and availability checking.

##### New MCP Tools (5):
- **list_models** — List available models by type.
- **get_model_info** — Get detailed model information.
- **check_model_exists** — Check if specific model is available.
- **get_workflow_models** — Extract model requirements from workflow.
- **check_workflow_models** — Validate all required models are available.

### Changed

- MCP server: reorganized tool registration into 9 functional categories.
- Documentation: comprehensive updates across all doc files (MCP-SETUP, workflow-builder, AI-ASSISTANT-GUIDE, INDEX).
- Tests: 18 test suites covering all phases (workflow-builder, dynamic-builder, batch-executor, chainer, macro, hybrid-discovery, model-manager, output-manager, etc.).

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
