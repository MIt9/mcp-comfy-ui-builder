# 🚀 Getting Started - Node Discovery System

> Quick start and practical examples

***

## Requirements

- Node.js 18+

***

## Quick start (seed + MCP)

1. **Clone and install**

   ```bash
   git clone https://github.com/MIt9/mcp-comfy-ui-builder.git && cd mcp-comfy-ui-builder
   npm install
   ```

2. **Build** (postbuild fills knowledge from seed)

   ```bash
   npm run build
   npm run mcp
   ```

3. **Connect MCP** in Cursor or Claude Desktop — see [MCP-SETUP.md](MCP-SETUP.md).

***

## Commands

| Command | Description |
|---------|-------------|
| `npm run seed` | Fill knowledge from seed. Use `--force` to overwrite. |
| `npm run sync-manager` | Update custom packs list from ComfyUI-Manager (GitHub) |
| `npm run mcp` | Start MCP server (after `npm run build`) |
| `npm test` | Run tests |

***

## Adding a node manually

1. Add an object to `knowledge/base-nodes.json` → `nodes.NodeClassName` (see existing entries for structure).
2. Update `knowledge/node-compatibility.json` (producers/consumers for the node’s return types) if needed.

***

## Next steps

- **Task navigation**: [doc/README.md](README.md)
- **Quick reference**: [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
- **MCP**: [MCP-SETUP.md](MCP-SETUP.md)

***

*Getting Started v1.2.0* | *2026-02-01*
