# 🚀 Quick Reference - Node Discovery System

> Quick reference guide for commands, structures, colors, and examples

***

## ⚡ Most common commands (Copy-Paste Ready)

### 🌱 Seed knowledge base

```bash
npm run seed
npm run seed -- --force
```

### 🔄 Sync custom packs

```bash
npm run sync-manager
```

### 🧪 Tests and MCP

```bash
npm test
npm run test:watch
npm run build && npm run mcp
```

***

## 📁 Quick file overview

```
knowledge/
├── base-nodes.json
├── seed-base-nodes.json
├── seed-node-compatibility.json
├── custom-nodes.json
└── node-compatibility.json

Documents: SUMMARY.md, QUICK-REFERENCE.md, GETTING-STARTED.md, SYSTEM-DIAGRAM.md
```

***

## 🎨 Data type colors

| Type | Hex | Producers | Consumers |
| :-- | :-- | :-- | :-- |
| MODEL | #B22222 | CheckpointLoader | KSampler |
| CLIP | #FFD700 | CheckpointLoader | CLIPTextEncode |
| CONDITIONING | #FFA931 | CLIPTextEncode | KSampler |
| LATENT | #FF6E6E | EmptyLatentImage | KSampler, VAEDecode |
| IMAGE | #64B5F6 | VAEDecode | SaveImage |
| MASK | #81C784 | ImageToMask | SetLatentNoiseMask |
| INT/FLOAT | #A9A9A9 | - | steps, cfg |
| STRING | #A9A9A9 | - | prompts |

***

## 📋 Node JSON structure (minimal)

```json
{
  "display_name": "Node Name",
  "category": "image/processing",
  "description": "What it does in 1-2 sentences",
  "input_types": {
    "required": {
      "param1": {"type": "IMAGE", "color": "#64B5F6"},
      "strength": {"type": "FLOAT", "default": 1.0}
    }
  },
  "return_types": ["IMAGE"],
  "return_names": ["IMAGE"],
  "output_colors": ["#64B5F6"],
  "priority": "medium"
}
```

***

## 🔍 ComfyUI API Quick Commands

```bash
curl http://127.0.0.1:8188/system_stats | jq '.system.gpu_name'
curl http://127.0.0.1:8188/object_info | jq 'keys | length'
curl http://127.0.0.1:8188/object_info | jq '.KSampler.input.required | keys'
```

***

## 🐛 Troubleshooting

| Problem | Solution |
| :-- | :-- |
| Seed file not found | Run from project root (where `knowledge/` is). |
| Empty node list | Run `npm run seed` or `npm run build` (postbuild runs seed). |
| MCP doesn't see tools | Use absolute path to `dist/mcp-server.js`, restart Cursor/Claude. |

***

*Quick Reference v1.2.0* | *2026-02-01*
