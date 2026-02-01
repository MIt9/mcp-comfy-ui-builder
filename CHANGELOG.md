# Changelog — mcp-comfy-ui-builder

Project change history. Knowledge base (nodes) → [knowledge/CHANGELOG.md](knowledge/CHANGELOG.md).

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
