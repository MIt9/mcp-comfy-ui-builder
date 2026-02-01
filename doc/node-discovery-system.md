# 🔧 Node Discovery System - Technical Implementation

> Detailed technical documentation: architecture, API, code, integration

***

## 🏗️ System Architecture

```
INPUT LAYER:
  ComfyUI API /object_info | ComfyUI Manager custom-node-list | GitHub Repos (README, __init__.py)
          │                              │                              │
          └──────────────────────────────┼──────────────────────────────┘
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
                         │   AINodeDescriptionGenerator  │
                         │   Claude 3.5 Sonnet           │
                         │   generateDescription()       │
                         │   generateBatch()            │
                         │   buildPrompt()               │
                         └───────────────┬───────────────┘
                                         │
                         ┌───────────────▼───────────────┐
                         │   KnowledgeBaseUpdater        │
                         │   addNode()                   │
                         │   updateCompatibility()       │
                         │   generateChangelog()         │
                         └───────────────┬───────────────┘
                                         │
                         OUTPUT: base-nodes.json, custom-nodes.json, node-compatibility.json
                                         │
                         ┌───────────────▼───────────────┐
                         │         MCP Server            │
                         │  list_node_types()             │
                         │  get_node_info()               │
                         │  check_compatibility()         │
                         └───────────────────────────────┘
```

***

## 📋 Type Definitions

### RawNodeInfo

```typescript
interface RawNodeInfo {
  class_name: string;
  display_name?: string;
  category?: string;
  input: Record<string, any>;
  output: string[];
  output_name: string[];
  description?: string;
  source: 'comfyui_api' | 'manager' | 'github';
  author?: string;
  github?: string;
}
```

### NodeDescription

```typescript
interface NodeDescription {
  display_name: string;
  category: string;
  description: string;
  input_types: {
    required: Record<string, { type: string; description: string; color?: string; default?: any; notes?: string }>;
    optional?: Record<string, any>;
  };
  return_types: string[];
  return_names: string[];
  output_colors: string[];
  use_cases: string[];
  compatible_outputs: Record<string, string[]>;
  example_values: Record<string, any>;
  priority: 'high' | 'medium' | 'low';
}
```

***

## 🧩 Core Classes

### 1. NodeScanner

- **scanLiveInstance()**: GET `${comfyUIHost}/object_info`, parsing into `Map<string, RawNodeInfo>`
- **fetchManagerList()**: loading ComfyUI-Manager custom-node-list.json
- **analyzeRepository(repoUrl)**: GitHub API — README.md, __init__.py, parsing nodes

### 2. AINodeDescriptionGenerator

- **generateDescription(rawNode)**: building prompt from RawNodeInfo, calling Claude, parsing JSON into NodeDescription
- **generateBatch(nodes, batchSize)**: batch with rate limiting (e.g., 1s between batches)
- **buildPrompt(node)**: template from node-description-prompt-template.md + JSON input/output

### 3. KnowledgeBaseUpdater

- **addNode(className, description, isCustom)**: add/update entry in base-nodes.json or custom-nodes.json
- **updateCompatibility(nodeClass, desc)**: update node-compatibility.json (producers/consumers)
- **generateChangelog(newNodes)**: append to CHANGELOG.md

***

## 🔗 MCP Integration

Tools for MCP server:

- **list_node_types**: return keys from base-nodes.json (and custom-nodes.json if needed)
- **get_node_info(node_name)**: return full node object from knowledge base
- **check_compatibility(from_node, to_node)**: use node-compatibility.json to check types
- **suggest_nodes(task_description)**: search by description/use_cases (or future LLM)

Loading data:

```typescript
import baseNodes from './knowledge/base-nodes.json';
import compatibility from './knowledge/node-compatibility.json';
```

***

## 📁 Project Files

- `src/node-discovery/scanner.ts` — NodeScanner
- `src/node-discovery/ai-generator.ts` — AINodeDescriptionGenerator
- `src/node-discovery/updater.ts` — KnowledgeBaseUpdater
- `src/node-discovery/cli.ts` — commander (scan, sync-manager, analyze, add-node)
- `knowledge/` — base-nodes.json, custom-nodes.json, node-compatibility.json, README.md, node-description-prompt-template.md

***

*Technical Implementation v1.1.0* | *2026-02-01*

**Full checklist**: IMPLEMENTATION-CHECKLIST.md
