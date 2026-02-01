# 🚀 Getting Started - Node Discovery System

> Quick start and practical examples

***

## Requirements

- Node.js 18+
- ComfyUI running on http://127.0.0.1:8188 (or your URL)
- Claude API key (Anthropic) — for automatic description generation
- ComfyUI-Manager (recommended) — for full node list

***

## Option 1: Manual node addition (no code)

**Time: ~15 minutes**

1. Get node info from ComfyUI:
   ```bash
   curl http://127.0.0.1:8188/object_info | jq '.NodeName' > node.json
   ```

2. Open **prompt template**: `knowledge/node-description-prompt-template.md`

3. Insert `node.json` content into the prompt for Claude (according to instructions in template)

4. Get structured JSON from Claude and add it to `knowledge/base-nodes.json` (in the `nodes` object)

5. Update `knowledge/node-compatibility.json` if needed (data types, producers/consumers)

**Result**: New node documented in knowledge base, ready for MCP/Claude.

***

## Option 2: Interactive wizard (`add-node`)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npm run add-node
```

1. Enter the node's **class name** (e.g., `KSampler`).
2. System fetches data from ComfyUI (`GET /object_info`), forms prompt from template `knowledge/node-description-prompt-template.md` and calls Claude.
3. Generated JSON is added to `knowledge/base-nodes.json`, `node-compatibility.json` and CHANGELOG are updated.

Required: ComfyUI running (`COMFYUI_HOST`), `ANTHROPIC_API_KEY`.

***

## Option 3: Automatic scan

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npm run scan
```

System: connects to ComfyUI `/object_info`, finds nodes not yet in the database, generates descriptions via Claude, updates JSON and CHANGELOG.

**Dry run (no write):** `npm run scan:dry`

**Environment variables:** `COMFYUI_HOST` (default `http://127.0.0.1:8188`), `ANTHROPIC_API_KEY`, `NODE_BATCH_SIZE` (optional), `DEBUG=1` for detailed logging.

***

## Quick ComfyUI API commands

```bash
# Check that ComfyUI is available
curl http://127.0.0.1:8188/system_stats | jq '.system.gpu_name'

# How many nodes are available
curl http://127.0.0.1:8188/object_info | jq 'keys | length'

# Info about a specific node
curl http://127.0.0.1:8188/object_info | jq '.KSampler'
```

***

## Tests

```bash
npm test
npm run test:watch
```

Tests: scanner, ai-generator, updater, MCP tools (unit), scan integration (mock).

***

## Next steps

- **Task navigation**: [doc/README.md](README.md)
- **Full understanding**: [SUMMARY.md](SUMMARY.md) → [SYSTEM-DIAGRAM.md](SYSTEM-DIAGRAM.md)
- **Quick reference**: [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
- **MCP**: [MCP-SETUP.md](MCP-SETUP.md)

***

*Getting Started v1.2.0* | *2026-02-01*
