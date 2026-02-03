# Documentation — ComfyUI Node Discovery

Single entry point for documentation: navigate **by task**, then go to the needed file.

---

## Quick Start (5 min)

1. **Install:** `npm install` (from project root).
2. **Build:** `npm run build` (postbuild fills knowledge from seed).
3. **Run MCP:** `npm run mcp`. Connect in Cursor/Claude — see [MCP-SETUP.md](MCP-SETUP.md).

More details → [GETTING-STARTED.md](GETTING-STARTED.md).

---

## By Task

| What you want to do | Document |
|---------------------|----------|
| **Commands at hand** (seed, sync-manager, sync-nodes, mcp) | [QUICK-REFERENCE.md](QUICK-REFERENCE.md) |
| **Complete start** (seed + MCP) | [GETTING-STARTED.md](GETTING-STARTED.md) |
| **Connect MCP in Cursor or Claude Desktop** | [MCP-SETUP.md](MCP-SETUP.md) |
| **Workflow Builder** (templates, save/load, execute) | [workflow-builder.md](workflow-builder.md) |
| **AI assistant guide** (after npm i -g) | [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) |
| **Image generation recommendations** (resources, text-in-image, model choice) | [IMAGE-GENERATION-RECOMMENDATIONS.md](IMAGE-GENERATION-RECOMMENDATIONS.md) |
| **ComfyUI API details** (object_info, endpoints) | [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md), [comfyui-api-detailed-guide.md](comfyui-api-detailed-guide.md) |
| **How to use knowledge base in code** | [knowledge-base-usage-guide.md](knowledge-base-usage-guide.md), [knowledge/README.md](../knowledge/README.md) |
| **Docker** (MCP + ComfyUI) | [DOCKER-SETUP.md](DOCKER-SETUP.md) — `docker pull siniidrozd/mcp-comfy-ui-builder` |

---

## All Documents (List)

| File | Purpose |
|------|---------|
| [INDEX.md](INDEX.md) | Complete navigation (tables, FAQ, links to knowledge/) |
| [GETTING-STARTED.md](GETTING-STARTED.md) | Quick start, seed + MCP |
| [QUICK-REFERENCE.md](QUICK-REFERENCE.md) | Commands, JSON structures, troubleshooting |
| [MCP-SETUP.md](MCP-SETUP.md) | MCP launch, connect in Cursor/Claude |
| [workflow-builder.md](workflow-builder.md) | Templates, params, save/load, ComfyUI workflow format |
| [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) | AI assistant guide (npm i -g) |
| [GENERATE-AND-VERIFY.md](GENERATE-AND-VERIFY.md) | Generate and verify workflow |
| [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md) | ComfyUI API — quick reference |
| [comfyui-api-detailed-guide.md](comfyui-api-detailed-guide.md) | ComfyUI API — detailed guide |
| [knowledge-base-usage-guide.md](knowledge-base-usage-guide.md) | Knowledge base in code (Node, Python, jq) |

Knowledge base (single source of truth) — **`knowledge/`** folder at project root.
