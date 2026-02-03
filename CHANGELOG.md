# Changelog — mcp-comfy-ui-builder

Project change history. Knowledge base (nodes) → [knowledge/CHANGELOG.md](knowledge/CHANGELOG.md).

---

## [Unreleased]

## [2.4.1] – 2026-02-03

### Fixed (TypeScript build)

- **output-manager.ts:** `options` possibly undefined — use `options?.convert_quality`. Buffer assignability (TS2322) — use `Buffer.from(converted)` / `Buffer.from(webpBuf)` and explicit `let buffer: Buffer` so CI/build passes. [src/output-manager.ts](src/output-manager.ts).

---

## [2.4.0] – 2026-02-03

### Added (output format, restyle workflow)

- **output_format for downloads:** `download_by_filename` and `download_output` accept optional **output_format** (png, jpeg, webp). Images are converted server-side with sharp before saving or returning base64. Optional **convert_quality** for jpeg/webp. [src/output-manager.ts](src/output-manager.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **restyle template:** New template **restyle** — image-to-image in a chosen style (cartoon, oil_painting, anime, watercolor, sketch, comic, pixel_art, pastel, cyberpunk or free text). Same pipeline as img2img; style maps to prompt; default denoise 0.65. [src/workflow/workflow-builder.ts](src/workflow/workflow-builder.ts).
- **build_restyle_workflow:** New tool returns workflow JSON plus **recipe** (prompt, denoise, steps, cfg, seed, ckpt_name, image) so the user can run or regenerate with the same settings. [src/mcp-server.ts](src/mcp-server.ts).

### Changed (docs)

- **doc/workflow-builder.md:** Section for restyle template and build_restyle_workflow.
- **doc/MCP-SETUP.md:** list_templates includes restyle; build_restyle_workflow in tools table.

### Tests

- **output-manager.test.ts:** output_format webp/jpeg (file and base64), dest path extension when no image ext.
- **workflow-builder.test.ts:** restyle template, buildRestyleWithRecipe, STYLE_PROMPTS.

---

## [2.3.1] – 2026-02-03

### Fixed (REPORT-MCP-SERVER-USAGE, status vs outputs)

- **execute_workflow_sync status "error" when outputs present:** When status is failed but outputs exist, response now includes **outputs_present_hint** advising to use `download_output` or `get_last_output`. Tool description updated: when status is error, still check outputs and use download/get_last_output to retrieve files. [src/mcp-server.ts](src/mcp-server.ts).
- **Progress/error message `[object Object]`:** Progress log uses `String(progress.current_node)` so node id is never serialized as `[object Object]`. ComfyUI history error detail: when `messages[0]` is an object, use `JSON.stringify(messages[0])` instead of `String(messages[0])` for readable error text. [src/mcp-server.ts](src/mcp-server.ts), [src/comfyui-client.ts](src/comfyui-client.ts).

### Changed (docs, M-Flux clarification)

- **M-Flux vs desktop FLUX:** Clarified that M-Flux is a quantized/MLX variant (different model or same FLUX via custom nodes like Mflux-ComfyUI, ComfyUI-MLX), not desktop FLUX. `flux_ready` refers to desktop FLUX (~12GB+ VRAM). [src/resource-analyzer.ts](src/resource-analyzer.ts), [doc/IMAGE-GENERATION-RECOMMENDATIONS.md](doc/IMAGE-GENERATION-RECOMMENDATIONS.md), [src/mcp-server.ts](src/mcp-server.ts) — get_system_resources description.

---

## [2.3.0] – 2026-02-03

### Added (ComfyUI_MCP_Feedback — FLUX, Apple Silicon)

- **txt2img_flux template:** FLUX txt2img workflow (CheckpointLoaderSimple → CLIPTextEncodeFlux → ModelSamplingFlux → KSampler cfg=1 → VAEDecode → SaveImage). Params: width, height, steps, prompt/clip_l/t5xxl, guidance, ckpt_name (e.g. flux1-dev-fp8.safetensors). [src/workflow/workflow-builder.ts](src/workflow/workflow-builder.ts).
- **Resource check before FLUX:** `build_workflow` with template `txt2img_flux` checks `get_system_resources` when ComfyUI is configured; fails with clear error if `flux_ready` is false or resolution exceeds `flux_max_width`×`flux_max_height`. [src/mcp-server.ts](src/mcp-server.ts).
- **flux_ready, flux_max_width, flux_max_height:** `get_system_resources` now returns FLUX suitability (true when VRAM tier is high or very_high, ~12GB+). [src/resource-analyzer.ts](src/resource-analyzer.ts).
- **platform_hints for Apple Silicon:** When GPU name suggests M1/M2/M3 or MPS, `get_system_resources` returns `platform_hints` suggesting M-Flux (Mflux-ComfyUI), ComfyUI-MLX and other MPS/MLX-optimized models. Same hints appear in `get_generation_recommendations` and in `build_workflow` error when txt2img_flux is used without sufficient resources. [src/resource-analyzer.ts](src/resource-analyzer.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **Docs:** [doc/IMAGE-GENERATION-RECOMMENDATIONS.md](doc/IMAGE-GENERATION-RECOMMENDATIONS.md) — section "Platform-specific models (Apple Silicon M1/M2/M3)" (M-Flux, ComfyUI-MLX). [doc/MCP-SETUP.md](doc/MCP-SETUP.md) — get_system_resources mentions flux_ready and platform_hints.

### Added (ComfyUI_MCP_Feedback — adaptive timeout, base64, errors, model hint)

- **Adaptive timeout (4.2):** `get_system_resources` returns **recommended_timeout_ms** (by tier; ~2.5× on MPS/Apple). `execute_workflow_sync` uses it when `timeout_ms` is omitted. [src/resource-analyzer.ts](src/resource-analyzer.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **Base64 / WebP when large (4.3):** When `download_by_filename` is called with `return_base64: true` and file size > 800 KB, image is auto-converted to WebP (quality 85) to stay under ~1MB. Optional params: `max_base64_bytes`, `convert_quality`. Dependency: sharp. [src/output-manager.ts](src/output-manager.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **get_error_details (4.4):** New tool `get_error_details(prompt_id)` returns full error details from ComfyUI history (node_id, exception_type, exception_message, full traceback). Use when execution failed. [src/mcp-server.ts](src/mcp-server.ts).
- **suggest_template_for_checkpoint (4.5):** New tool `suggest_template_for_checkpoint(ckpt_name)` suggests template (txt2img_flux or txt2img) from checkpoint filename (flux/sdxl/sd1.5 patterns). [src/mcp-server.ts](src/mcp-server.ts).
- **listOutputs retry delay option:** `listOutputs(promptId, options?)` accepts optional `retryDelayMs` (e.g. 0 in tests to avoid real delay). [src/output-manager.ts](src/output-manager.ts).

### Tests

- **resource-analyzer.test.ts:** flux_ready only for high/very_high; platform_hints for Apple M1; recommended_timeout_ms (higher on Apple).
- **workflow-builder.test.ts:** listTemplates includes txt2img_flux; buildFromTemplate('txt2img_flux') returns FLUX graph with CLIPTextEncodeFlux, ModelSamplingFlux, cfg=1.
- **output-manager.test.ts:** use `listOutputs(..., { retryDelayMs: 0 })` instead of long timeout so tests run without real delay.

---

## [2.2.1] – 2026-02-03

### Fixed (Claude Desktop MCP feedback)

- **execute_workflow_sync returned completed when job actually failed:** Polling now treats `status_str: 'error'` or `'canceled'` as failure even when ComfyUI leaves `messages` empty. Result status is `failed` (MCP response uses `status: 'error'`) with error details. [src/comfyui-client.ts](src/comfyui-client.ts) — `submitPromptAndWait()`, `waitWithPolling()`.
- **download_by_filename ENOENT when dest dir exists:** Clearer error on ENOENT/EACCES: explains that `dest_path` is resolved on the MCP server host and suggests `return_base64: true` when server runs in a different environment (e.g. host vs container). [src/output-manager.ts](src/output-manager.ts).
- **get_execution_status had no error details:** Now parses ComfyUI history `status.messages` and surfaces node-level errors: `node_id`, `exception_type`, `exception_message`, and first lines of `traceback`. [src/mcp-server.ts](src/mcp-server.ts).
- **get_last_output returned older successful prompt:** Now returns the most recent prompt that has image output (skips failed prompts). Description updated to "most recent prompt that has image output (skips failed prompts)". [src/mcp-server.ts](src/mcp-server.ts).
- **execute_workflow_sync:** Response uses `status: 'error'` when execution failed (was `failed`); removed `progress_method` from response; `progress_log` still included when streaming. [src/mcp-server.ts](src/mcp-server.ts).

### Fixed (build/CI)

- **TypeScript build (CI release):** `isHistoryEntryFinal` return type — use `Boolean()` for `hasOutputs` in [src/comfyui-client.ts](src/comfyui-client.ts) and [src/output-manager.ts](src/output-manager.ts) so return type is `boolean` (fixes TS2322).

### Tests

- **comfyui-client.test.ts:** Test that `submitPromptAndWait` returns `status: 'failed'` when history has `status_str: 'error'` and empty `messages`.

---

## [2.2.0] – 2026-02-03

### Fixed (live findings: race conditions, remote download, OOM, interrupt)

- **execute_workflow_sync premature completed:** Polling now treats as finished only when history entry is final (`status_str` in `success`/`finished`/`error`/`canceled`/`cached`) or has outputs. Avoids race where workflow is still running in queue but MCP returned `completed` with no outputs. [src/comfyui-client.ts](src/comfyui-client.ts) — `isHistoryEntryFinal()`, `waitWithPolling()`, `submitPromptAndWait()`.
- **list_outputs when prompt still running:** If prompt exists in history but status is not final and no outputs, `listOutputs` now throws a clear error: "Prompt … is not completed yet (status: running). Try list_outputs again in a few seconds." [src/output-manager.ts](src/output-manager.ts).
- **download_by_filename for remote MCP:** New option `return_base64`. When true, file is not written to disk; returns `{ filename, mime, encoding: "base64", data }` so the client (e.g. bash on another host) can save the file locally. [src/output-manager.ts](src/output-manager.ts), [src/mcp-server.ts](src/mcp-server.ts).
- **FLUX / large resolution OOM:** Before submitting a workflow, `execute_workflow_sync` now checks workflow width/height against `get_system_resources` recommendations. If resolution exceeds `max_width`×`max_height`, submission is rejected with a clear error to avoid OOM (e.g. FLUX on MPS). [src/resource-analyzer.ts](src/resource-analyzer.ts) — `getWorkflowResolution()`, [src/mcp-server.ts](src/mcp-server.ts).
- **interrupt_execution not freeing GPU:** New optional parameter `cleanup_after_ms`. When set (and `prompt_id` given), after sending interrupt the tool polls the queue and removes the prompt if still there, so the next job can run. [src/mcp-server.ts](src/mcp-server.ts).

### Tests

- **comfyui-client.test.ts:** Test that `submitPromptAndWait` does not return completed when history has `status_str: 'running'` and no outputs; only completes after final status/outputs.

---

## [2.1.6] – 2026-02-03

### Fixed (Bug_Report_3 — timing, download_by_filename)

- **list_outputs timing:** ComfyUI може записати history з ~2с затримкою після `completed`. `listOutputs` тепер робить до 3 спроб з паузою 2с між ними. [src/output-manager.ts](src/output-manager.ts).
- **download_by_filename 404:** При 404 retry з alternate host (127.0.0.1 ↔ localhost) для випадків, коли ComfyUI прив’язаний до іншого host. [src/comfyui-client.ts](src/comfyui-client.ts) — `fetchOutputByFilename()`.

### Tests

- **output-manager.test.ts:** Тест retry — outputs з’являються після delay. [tests/output-manager.test.ts](tests/output-manager.test.ts).

---

## [2.1.5] – 2026-02-03

### Fixed (Bug_Report_3)

- **list_outputs не бачить свіжий промпт:** Якщо GET `/history/{prompt_id}` повертає порожній результат (fresh prompt), fallback на GET `/history` і пошук prompt у повному списку. [src/output-manager.ts](src/output-manager.ts) — `listOutputs()`.
- **get_history(limit=N) повертав найстаріші, не найновіші:** Для array-відповіді ComfyUI додано reverse (newest first). [src/comfyui-client.ts](src/comfyui-client.ts) — `getHistory()`.

### Tests

- **output-manager.test.ts:** Тест fallback — коли GET /history/{id} порожній, listOutputs бере з full history. [tests/output-manager.test.ts](tests/output-manager.test.ts).

---

## [2.1.4] – 2026-02-03

### Fixed (Bug_Report_2 — залишок)

- **execute_workflow_sync timeout коли WebSocket не отримує progress events:** У v2.1.3 fallback спрацьовував лише при `current_node_progress >= 100%`. Якщо на MPS ComfyUI взагалі не шле events (лише `[queued] waiting`), condition ніколи не true. Рішення — паралельний polling: `waitForCompletion` тепер запускає WebSocket і polling одночасно; перший що поверне `completed` або `failed` — виграє. [src/comfyui-client.ts](src/comfyui-client.ts) — `waitForCompletion()`.

### Tests

- **comfyui-client-parallel-poll.test.ts:** Новий тест — WS підключається але ніколи не відправляє progress; перевіряє що polling резолвить з `status: 'completed'`. [tests/comfyui-client-parallel-poll.test.ts](tests/comfyui-client-parallel-poll.test.ts).

---

## [2.1.3] – 2026-02-03

### Fixed (Bug_Report_2)

- **execute_workflow_sync повертав `timeout` замість `completed` на MPS/macOS**

  **Симптом:** Генерація виконувалася коректно (файл є, ComfyUI status = success), WebSocket транслював progress до 100%, але `execute_workflow_sync` повертав `status: "timeout"` та `error: "Timed out after 120000ms"`. Потрібен був додатковий виклик `get_execution_status(prompt_id)` для отримання реального статусу — flow не був end-to-end.

  **Причина:** WebSocket event `executing` з `node: null` (сигнал завершення) не приходить або приходить інакше на MPS/macOS. Функція `waitWithWebSocket` чекала лише на `progress.status === 'completed'`, який ніколи не наставав.

  **Рішення:** Fallback на polling після 100% progress. Якщо WebSocket показує `current_node_progress >= 1`, але `completed` event не надходить протягом 3 секунд — автоматично викликається `waitWithPolling(prompt_id)`, який читає GET `/history` і коректно резолвить з `status: 'completed'` та outputs.

  **Зміни:**
  - [src/comfyui-client.ts](src/comfyui-client.ts) — `waitWithWebSocket()`: умова `current_node_progress >= 1` → `setTimeout(3000)` → `waitWithPolling(promptId, 10_000)`.
  - Константи: `POLL_FALLBACK_DELAY_MS = 3000`, `POLL_FALLBACK_TIMEOUT_MS = 10_000`.

### Tests

- **comfyui-client-websocket-fallback.test.ts:** Новий файл — мокає WebSocket, що віддає 100% progress без `status: 'completed'`; перевіряє resolve через polling fallback з `status: 'completed'`. [tests/comfyui-client-websocket-fallback.test.ts](tests/comfyui-client-websocket-fallback.test.ts).
- **comfyui-client.test.ts:** Тест "submitPromptAndWaitWithProgress returns prompt_id on wait failure" — приймає і `failed`, і `timeout` як валідні статуси (залежить від того, чи WS підключається).

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
