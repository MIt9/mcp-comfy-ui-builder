# 🔍 ComfyUI Node Discovery System

> Seed knowledge base and MCP tools for ComfyUI nodes (Cursor/Claude)

***

## 🎯 Overview

- **Seed** `knowledge/base-nodes.json` and `node-compatibility.json` from bundled seed (no external services).
- **Sync** custom packs list from ComfyUI-Manager (GitHub).
- **MCP server** with tools: list_node_types, get_node_info, check_compatibility, suggest_nodes.

***

## 🚀 Quick Start

```bash
git clone https://github.com/MIt9/mcp-comfy-ui-builder.git && cd mcp-comfy-ui-builder
npm install
npm run build   # postbuild fills knowledge from seed
npm run mcp
```

***

## 📦 Prerequisites

- Node.js 18+

***

## 🛠️ CLI Commands

| Command | Description |
| :-- | :-- |
| `npm run seed` | Fill knowledge from seed. Use `--force` to overwrite. |
| `npm run sync-manager` | Update custom packs list from ComfyUI-Manager |
| `npm run mcp` | Start MCP server (after `npm run build`) |

***

## 📊 Knowledge Base

### File Structure

```
knowledge/
├── base-nodes.json          # 52 base nodes (KSampler, ...)
├── custom-nodes.json        # 15 custom packs (WAS Suite, ...)
├── node-compatibility.json  # 11 data types + 150+ connections
├── README.md
└── CHANGELOG.md             # auto-generated
```

### Node Format (JSON Schema)

```json
{
  "display_name": "KSampler",
  "category": "sampling",
  "description": "Core diffusion sampling node",
  "input_types": {
    "required": {
      "model": {"type": "MODEL", "color": "#B22222"},
      "steps": {"type": "INT", "default": 20}
    }
  },
  "return_types": ["LATENT"],
  "use_cases": ["txt2img", "img2img"],
  "priority": "high"
}
```

***

## 🎨 Type System

| Тип | Кольор | Producers | Consumers |
| :-- | :-- | :-- | :-- |
| MODEL | #B22222 | CheckpointLoader | KSampler |
| CLIP | #FFD700 | CheckpointLoader | CLIPTextEncode |
| CONDITIONING | #FFA931 | CLIPTextEncode | KSampler |
| LATENT | #FF6E6E | EmptyLatentImage | KSampler, VAEDecode |
| IMAGE | #64B5F6 | VAEDecode | SaveImage |

***

## 🤖 Knowledge base pipeline

Seed files → `npm run seed` → base-nodes.json + node-compatibility.json → MCP server

***

## 🧪 Use Cases

### Use Case 1: Weekly Update

```bash
npm run seed
npm run sync-manager
git add knowledge/ && git commit -m "Weekly node update"
```

### Use Case 2: New Node Pack

Run `npm run seed` to fill knowledge from seed.

### Use Case 3: Manual Addition

```bash
npm run seed
```

***

## 🏗️ Architecture

Seed files → CLI seed → base-nodes.json, node-compatibility.json → MCP server. Sync-manager fetches custom packs from GitHub.

**Details**: node-discovery-system.md

***

## 🐛 Troubleshooting

| Problem | Solution |
| :-- | :-- |
| Seed file not found | Run from project root (where `knowledge/` is). |
| Empty node list | Run `npm run seed` or `npm run build` (postbuild runs seed). |

**Деталі**: comfyui-api-detailed-guide.md

***

*Version: 1.1.0* | *Updated: 2026-02-01*
