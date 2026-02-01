# 🔍 ComfyUI Node Discovery System

> Automated system for discovering, analyzing, and documenting ComfyUI nodes with AI-powered descriptions

***

## 🎯 Overview

**Problem**: New custom node pack = dozens of nodes without documentation for AI.

**Solution**: System that **automatically**:

1. **Discovers** new nodes from ComfyUI API
2. **Analyzes** their structure (INPUT/OUTPUT types)
3. **Generates** detailed descriptions via Claude AI
4. **Updates** knowledge base in structured JSON

**Result**: Complete knowledge base for MCP server in 25 minutes instead of 25 hours of manual work.

***

## 🚀 Quick Start

### Installation (5 minutes)

```bash
git clone <your-repo>
cd comfyui-node-discovery
npm install
export ANTHROPIC_API_KEY="sk-ant-your-key"
cd ComfyUI && python main.py --listen
```

### First Run (2 minutes)

```bash
npm run scan
```

***

## 📦 Installation

### Prerequisites

- Node.js 18+
- ComfyUI at http://127.0.0.1:8188
- Claude API key (Anthropic)
- ComfyUI-Manager (recommended)

### Full Setup

```bash
mkdir comfyui-node-discovery && cd comfyui-node-discovery
npm init -y
npm install @anthropic-ai/sdk @octokit/rest commander node-fetch
npm install -D typescript @types/node tsx
echo 'ANTHROPIC_API_KEY=your-key-here' > .env
echo 'COMFYUI_HOST=http://127.0.0.1:8188' >> .env
cp -r knowledge/ .
```

***

## 🛠️ CLI Commands

| Command | Description |
| :-- | :-- |
| `npm run scan` | Automatic scan of new nodes, Claude descriptions, JSON update |
| `npm run scan:dry` | Dry run without changes |
| `npm run sync-manager` | Updates list of custom node packs from ComfyUI Manager |
| `npm run analyze <repo-url>` | Analyzes GitHub repository and adds nodes |
| `npm run add-node` | Interactive wizard for manual addition |

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

## 🤖 AI Generation Pipeline

ComfyUI /object_info → NodeScanner → Claude Prompt → JSON Description → Knowledge Base

**Prompt Template**: knowledge/node-description-prompt-template.md

***

## 🧪 Use Cases

### Use Case 1: Weekly Update

```bash
npm run scan
npm run sync-manager
git add knowledge/ && git commit -m "Weekly node update"
```

### Use Case 2: New Node Pack

Install in ComfyUI custom_nodes, restart ComfyUI, then `npm run scan`.

### Use Case 3: Manual Addition

```bash
npm run add-node
```

***

## 🏗️ Architecture

ComfyUI /object_info → NodeScanner → AI Generator (Claude) → KnowledgeBaseUpdater → JSON Files → MCP Server

**Details**: node-discovery-system.md

***

## 🐛 Troubleshooting

| Problem | Solution |
| :-- | :-- |
| Connection refused | python main.py --listen 0.0.0.0 --port 8188 |
| Invalid JSON | Restart ComfyUI, check logs |
| Claude API error | Check ANTHROPIC_API_KEY |
| Rate limit exceeded | Decrease NODE_BATCH_SIZE |

**Деталі**: comfyui-api-detailed-guide.md

***

*Version: 1.1.0* | *Updated: 2026-02-01*
