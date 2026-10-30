# Local validation — 2026-10-26

Historical review: one administrative operation remained unverified after a timeout on 2026-10-26. See the 2026-10-30 follow-up below for the current handoff.

## Environment

- ComfyUI 0.42.1 at `http://127.0.0.1:8188`, Python 3.12.8, PyTorch 2.14.1, Apple MPS.
- Local MCP package version 3.0.0, 40 advertised tools.
- The Codex server entry exists but currently has `enabled=false`; this review did not change that preference. Direct stdio MCP checks work independently of the client toggle.

## Results

| Check | Result |
|---|---|
| TypeScript | Passed |
| Vitest 5.0.5 | 247 passed, 1 skipped |
| npm audit, all dependencies | 0 reported vulnerabilities after dependency updates |
| Package install from local npm tarball | Passed |
| npm executable, version, 40-tool discovery | Passed |
| Bundled knowledge lookup from unrelated cwd | Passed |
| Live MCP core run | 37 passed, 0 failed, 3 administrative operations excluded |
| Live MCP including administration | 39 passed, 1 timed out, 0 skipped |
| git diff --check | Passed |

The skipped Vitest case requires an SDXL checkpoint. No diffusion checkpoint was downloaded, and this validation does not establish txt2img quality or model-family compatibility. Live execution used EmptyImage/SaveImage and image-loading/scaling workflows; chain output dimensions and downloaded PNGs were checked.

Administrative checks passed for `reload_comfyui` and `install_model`. The model-install check used a small local safetensors embedding fixture to verify download and placement, not a trained generation model.

## Outstanding issue

`install_custom_node` was called for `comfyui-custom-scripts`. The MCP client timed out before installation returned. The harness used a 210-second request limit, while the cm-cli helper permits up to 300 seconds. This budget mismatch prevents a reliable verdict on a slow install; the timeout alone does not prove whether the package was installed successfully.

Before shipping:

1. Align the administrative request timeout with the installer budget.
2. Capture the complete installation result and verify the installed node pack on disk and after reload.
3. Rerun the administrative scenario and the final checks on the same source state.

Raw local artifacts (ignored by Git): `.tmp/live-mcp-review-report.json`, `.tmp/live-mcp-admin-report.json`. The npm package test helper is `.tmp/package-check.mjs`.

## Follow-up — 2026-10-30

- The user reported that the workflow appeared to work and explicitly requested commit and push.
- TypeScript, Vitest (247 passed, 1 skipped), and npm audit (0 vulnerabilities) passed again.
- The final checkpoint-free live run passed: 34 tool names covered, 0 failed, 6 skipped (queue mutation and administrative operations). Raw report: `.tmp/live-pre-push-report.json`.
- The live harness now gives custom-node installation at least 330 seconds, exceeding the installer's 300-second limit. Installation was not repeated; its earlier result remains unverified.
- The local Codex MCP entry is now enabled. A direct stdio check discovered 40 tools and successfully called `search_nodes` and `get_generation_recommendations`.
- Added `workflows/txt2img_1024_upscale_2x.json`: SDXL text-to-image at 1024×1024, tiled VAE decoding, Lanczos scaling to 2048×2048, and both image outputs.
- The pipeline requires a separately installed SDXL checkpoint. Its diffusion generation has not been verified here. The user requested no model downloads; the started download was stopped and its partial file removed.

## Changes made during review

- Updated compatible/transitive dependencies plus sharp 0.35.5 and Vitest 5.0.5 to resolve audit findings.
- Raised the documented Node.js minimum to 22.12 and aligned CI/Docker with Node.js 22.
- Corrected current setup guidance and verified the packaged executable from an unrelated directory.
- Removed generated local knowledge changes from the candidate changeset; existing unrelated untracked files remain outside it.
