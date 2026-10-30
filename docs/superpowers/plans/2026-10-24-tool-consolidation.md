# MCP Tool Consolidation Implementation Plan

> **For agentic workers:** Implement independent tool groups, then review and integrate their registrations in the main server.

**Goal:** Reduce the public MCP surface from 60 to 40 tools with explicit parameters and no aliases.

**Architecture:** Extract consolidated handlers into focused `src/tools/` modules. Preserve existing underlying clients and workflow helpers. Keep read and write operations separate, validate mutually exclusive parameter combinations, and update active documentation and protocol tests.

**Tech Stack:** TypeScript, MCP SDK, Zod, Vitest.

## Chunk 1: Implementation

- [x] Consolidate discovery and node inspection; test source selection and projections.
- [x] Consolidate workflow preset/restyle construction, input connections, and template validation.
- [x] Consolidate execution modes and execution inspection; retain timeouts and error handling.
- [x] Consolidate output selection/downloads, model lookup/dependencies, and recommendations.
- [x] Remove replaced registrations and update all tool cross-references.

## Chunk 2: Verification and documentation

- [x] Add MCP protocol coverage for new schemas, removed names, and offline behavior.
- [x] Update current docs and examples to new tool names and arguments; preserve historical changelog.
- [x] Run `npx tsc --noEmit`, relevant tests, the suite excluding the pre-existing untracked realtime test, and `git diff --check`.
- [x] Review the resulting tool count, schemas, behavior, and diff before delivery.
