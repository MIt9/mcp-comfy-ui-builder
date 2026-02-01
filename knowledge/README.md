# Knowledge Base - Node Discovery System

> Knowledge base structure, data formats, how to extend

***

## 📁 File Structure

```
knowledge/
├── base-nodes.json              # Base ComfyUI nodes (filled by seed)
├── seed-base-nodes.json         # Seed data for npm run seed
├── seed-node-compatibility.json # Seed compatibility for npm run seed
├── custom-nodes.json            # Custom node packs (ComfyUI-Manager)
├── node-compatibility.json      # Data types, producers/consumers (filled by seed)
├── README.md                    # This file
└── CHANGELOG.md                 # Change history
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

## How to Fill the Knowledge Base

Run **`npm run seed`** to fill `base-nodes.json` and `node-compatibility.json` from the bundled seed files.

- **Merge** (default): add only missing nodes from seed to existing base.
- **Overwrite**: `npm run seed -- --force` to replace base and compatibility with seed.

## How to Add a New Node

1. **Seed**: `npm run seed` to get the base set of nodes from seed files.
2. **Manually**: add an object to `base-nodes.json` → `nodes.NodeClassName` (or to custom-nodes as a pack).

After adding a node, update `node-compatibility.json` (producers/consumers for types) if needed.

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
