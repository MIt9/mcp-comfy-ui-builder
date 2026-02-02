# 📚 Documentation Navigation

**Quick entry:** [README.md](README.md) — task-based orientation and quick start.

---

## By Task

| Task | Document |
|------|----------|
| Quick launch, commands at hand | [QUICK-REFERENCE.md](QUICK-REFERENCE.md) |
| Complete start, seed + MCP | [GETTING-STARTED.md](GETTING-STARTED.md) |
| Connect MCP (Cursor / Claude Desktop) | [MCP-SETUP.md](MCP-SETUP.md) |
| Workflow Builder — templates, save/load, execute | [workflow-builder.md](workflow-builder.md) |
| AI assistant guide — how to use the package (e.g. after npm i -g) | [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) |
| Generate and verify (image → caption, check result) | [GENERATE-AND-VERIFY.md](GENERATE-AND-VERIFY.md) |
| Install custom nodes and models (LoRA, checkpoints, VAE) | [INSTALL-NODES-AND-MODELS.md](INSTALL-NODES-AND-MODELS.md) |
| ComfyUI API, knowledge base in code | [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md), [comfyui-api-detailed-guide.md](comfyui-api-detailed-guide.md), [knowledge-base-usage-guide.md](knowledge-base-usage-guide.md) |

---

## All Documents

### User (launch, MCP)

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Documentation entry, task-based navigation |
| [GETTING-STARTED.md](GETTING-STARTED.md) | Quick start, seed + MCP |
| [QUICK-REFERENCE.md](QUICK-REFERENCE.md) | Commands, JSON, troubleshooting |
| [MCP-SETUP.md](MCP-SETUP.md) | MCP launch, Cursor/Claude config |
| [workflow-builder.md](workflow-builder.md) | Templates, params, save/load, ComfyUI workflow format |
| [AI-ASSISTANT-GUIDE.md](AI-ASSISTANT-GUIDE.md) | AI assistant guide (npm i -g) |
| [GENERATE-AND-VERIFY.md](GENERATE-AND-VERIFY.md) | Generate and verify workflow |
| [INSTALL-NODES-AND-MODELS.md](INSTALL-NODES-AND-MODELS.md) | Install custom nodes and models via MCP |

### Reference

| Document | Purpose |
|----------|---------|
| [comfyui-api-quick-reference.md](comfyui-api-quick-reference.md) | ComfyUI API — brief |
| [comfyui-api-detailed-guide.md](comfyui-api-detailed-guide.md) | ComfyUI API — detailed |
| [knowledge-base-usage-guide.md](knowledge-base-usage-guide.md) | Knowledge base in code (Node, Python, jq) |
| [knowledge/README.md](../knowledge/README.md) | Knowledge base structure, seed, formats |

### Knowledge Base (files at project root)

**`knowledge/`** folder — single source of truth. Links from doc/ lead there.

| File | Purpose |
|------|---------|
| [knowledge/base-nodes.json](../knowledge/base-nodes.json) | Base nodes description |
| [knowledge/custom-nodes.json](../knowledge/custom-nodes.json) | Custom packs list |
| [knowledge/node-compatibility.json](../knowledge/node-compatibility.json) | Data types, producers/consumers |

---

## Quick Answers (FAQ)

- **Where to start?** → [README.md](README.md) → [GETTING-STARTED.md](GETTING-STARTED.md) or [QUICK-REFERENCE.md](QUICK-REFERENCE.md).
- **How to add a node?** Run `npm run seed` to fill from seed. Manually: add to base-nodes.json (see knowledge/README.md).
- **How to connect MCP?** → [MCP-SETUP.md](MCP-SETUP.md).
- **Where is knowledge base?** At project root: `knowledge/` folder.
