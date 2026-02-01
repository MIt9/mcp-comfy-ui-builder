# Knowledge Base - Node Discovery System

> Knowledge base structure, data formats, how to extend

***

## 📁 File Structure

```
knowledge/
├── base-nodes.json          # Base ComfyUI nodes (KSampler, CheckpointLoader, ...)
├── custom-nodes.json       # Custom node packs (ComfyUI-Manager, WAS Suite, ...)
├── node-compatibility.json # Data types, producers/consumers, compatibility rules
├── README.md               # This file
├── node-description-prompt-template.md  # Prompt for Claude (node descriptions)
└── CHANGELOG.md            # Change history (auto-generated on scan)
```

***

## Data Format

### base-nodes.json

- **metadata**: version, last_updated, total_nodes, categories
- **nodes**: object `{ "NodeClassName": { ... } }`

Each node contains:

- `display_name`, `category`, `description`
- `input_types`: `{ required: { param: { type, description, color?, default?, notes? } }, optional? }`
- `return_types`, `return_names`, `output_colors`
- `use_cases`, `compatible_outputs`, `example_values`
- `priority`: "high" | "medium" | "low"

### custom-nodes.json

- List of node packs with fields: name, repo, priority, key_nodes, use_cases, models

### node-compatibility.json

- **data_types**: for each type (MODEL, CLIP, LATENT, IMAGE, ...): color, producers[], consumers[]
- May contain workflow_patterns, validation_rules

***

## How to Add a New Node

1. **Manually**: add object to `base-nodes.json` → nodes.NodeClassName (or to custom-nodes as pack).
2. **Via Claude**: use `node-description-prompt-template.md` + JSON from `/object_info` → insert result into base-nodes.json.
3. **Automatically** (after implementation): `npm run scan` or `npm run add-node`.

After adding a node, it's worth updating `node-compatibility.json` (producers/consumers for types).

***

## TypeScript integration

```typescript
import baseNodes from './knowledge/base-nodes.json';
import compatibility from './knowledge/node-compatibility.json';

const nodeNames = Object.keys(baseNodes.nodes);
const nodeInfo = baseNodes.nodes['KSampler'];
const modelProducers = compatibility.data_types?.MODEL?.producers ?? [];
```

***

*Knowledge Base README v1.0* | *2026-02-01*
