# 🎨 Node Discovery System - Visual Diagram

> Architecture, data flows, workflow diagrams

***

## 🏗️ Complete System Architecture

```
INPUT SOURCES:
  LIVE COMFYUI (/object_info) | COMFYUI MANAGER (custom-node-list.json) | GITHUB REPOS (README, __init__.py)
          │                                    │                                    │
          └────────────────────────────────────┼────────────────────────────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │         NodeScanner           │
                               │  scanLiveInstance()           │
                               │  fetchManagerList()           │
                               │  analyzeRepository()          │
                               │  findNewNodes()               │
                               └───────────────┬───────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │   RawNodeInfo Collection      │
                               └───────────────┬───────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │   AINodeDescriptionGenerator  │
                               │   Claude 3.5 Sonnet           │
                               │   generateDescription()      │
                               │   generateBatch()            │
                               └───────────────┬───────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │   NodeDescription (JSON)      │
                               └───────────────┬───────────────┘
                                               │
                               ┌───────────────▼───────────────┐
                               │   KnowledgeBaseUpdater         │
                               │   addNode(), updateCompatibility(), generateChangelog() │
                               └───────────────┬───────────────┘
                                               │
                               OUTPUT: base-nodes.json, custom-nodes.json, node-compatibility.json, CHANGELOG.md
                                               │
                               ┌───────────────▼───────────────┐
                               │         MCP Server            │
                               │  list_node_types()            │
                               │  get_node_info()             │
                               │  check_compatibility()        │
                               │  suggest_nodes()              │
                               └───────────────────────────────┘
```

***

## 🔄 Workflow Diagrams

### Workflow 1: Automatic Scan

User: `npm run scan` → NodeScanner.scanLiveInstance() → ComfyUI /object_info → Compare with DB → AIGenerator.generateBatch() → Claude API → KnowledgeUpdater → SUCCESS

### Workflow 2: Manual Wizard

`npm run add-node` → Interactive Q&A → Build Prompt → Claude → Show JSON → Confirm → Add to DB

### Workflow 3: GitHub Analysis

`npm run analyze <url>` → GitHub API (README, __init__.py) → NodeScanner.analyzeRepo() → (same as Workflow 1)

***

## 🧩 Type Compatibility Matrix

MODEL (CheckpointLoader) → KSampler  
CLIP (CheckpointLoader) → CLIPTextEncode  
CONDITIONING (CLIPTextEncode) → KSampler  
LATENT (KSampler, EmptyLatentImage) → VAEDecode  
IMAGE (VAEDecode) → SaveImage  

***

## 📊 Data Flow - JSON Examples

**RawNodeInfo** (from /object_info): class_name, display_name, category, input, output, source  
**NodeDescription** (Claude output): display_name, description, input_types, use_cases, priority  

***

*Diagrams v1.1.0* | *2026-02-01*
