# 📚 Knowledge Base Usage Guide

> How to use the ComfyUI node knowledge base in your project, MCP server, and AI workflows

## 🎯 Knowledge Base Overview

The knowledge base contains **structured information about 65+ ComfyUI nodes** (base + custom) with AI-generated descriptions.

### File Structure

```
knowledge/
├── base-nodes.json              # 50+ base ComfyUI nodes
├── custom-nodes.json            # 15+ popular custom node packs
├── node-compatibility.json      # Data types, producers/consumers
├── README.md                    # This guide
├── node-description-prompt-template.md  # Claude template
└── CHANGELOG.md                 # Update history
```

**Total volume**: 2,194 lines of JSON + 581 lines of documentation

***

## 📂 Data Format

### 1. **base-nodes.json** - Base nodes

```json
{
  "metadata": {
    "version": "1.0.0",
    "last_updated": "2026-02-01",
    "total_nodes": 50
  },
  "nodes": {
    "KSampler": {
      "display_name": "KSampler",
      "category": "sampling",
      "description": "Core diffusion sampling node",
      "input_types": {
        "required": {
          "model": {
            "type": "MODEL",
            "description": "Diffusion model",
            "color": "#B22222"
          },
          "steps": {
            "type": "INT",
            "description": "Denoising steps",
            "default": 20,
            "min": 1,
            "max": 10000
          }
        }
      },
      "return_types": ["LATENT"],
      "return_names": ["LATENT"],
      "output_colors": ["#FF6E6E"],
      "priority": "high",
      "use_cases": [
        "Text-to-image generation",
        "Image-to-image denoising",
        "ControlNet workflows"
      ],
      "compatible_outputs": {
        "LATENT": ["VAEDecode", "LatentUpscale"]
      }
    }
  }
}
```

### 2. **custom-nodes.json** - Custom node packs

```json
{
  "metadata": {
    "total_packs": 15,
    "last_sync": "2026-02-01"
  },
  "node_packs": {
    "was-node-suite": {
      "github": "https://github.com/WASasquatch/was-node-suite-comfyui",
      "author": "WASasquatch",
      "stars": 1200,
      "priority": "high",
      "key_nodes": {
        "WAS_Image_Blend": {
          "category": "image/processing",
          "description": "Photoshop-style image blending"
        }
      }
    }
  }
}
```

### 3. **node-compatibility.json** - Type system

```json
{
  "data_types": {
    "MODEL": {
      "color": "#B22222",
      "producers": ["CheckpointLoaderSimple", "LoraLoader"],
      "consumers": ["KSampler", "ControlNetLoader"],
      "description": "Neural network models"
    },
    "IMAGE": {
      "color": "#64B5F6",
      "producers": ["VAEDecode", "LoadImage"],
      "consumers": ["ImageScale", "SaveImage"]
    }
  },
  "workflow_patterns": [
    "Checkpoint → CLIPTextEncode → KSampler → VAEDecode → SaveImage"
  ]
}
```

***

## 🛠️ Usage in Code

### TypeScript/Node.js

```typescript
// 1. Load knowledge base
import fs from 'fs';
import path from 'path';

interface NodeDescription {
  display_name: string;
  category: string;
  input_types: Record<string, any>;
  return_types: string[];
  priority: 'high' | 'medium' | 'low';
}

const knowledgeBase = {
  base: JSON.parse(fs.readFileSync('./knowledge/base-nodes.json', 'utf8')),
  custom: JSON.parse(fs.readFileSync('./knowledge/custom-nodes.json', 'utf8')),
  compatibility: JSON.parse(fs.readFileSync('./knowledge/node-compatibility.json', 'utf8'))
};

// 2. Query specific node
function getNodeInfo(nodeName: string): NodeDescription | null {
  return knowledgeBase.base.nodes[nodeName] || null;
}

// 3. Find compatible nodes
function findCompatible(inputType: string): string[] {
  return knowledgeBase.compatibility.data_types[inputType]?.consumers || [];
}

// Usage
const ksampler = getNodeInfo('KSampler');
console.log(ksampler?.display_name); // "KSampler"
console.log(findCompatible('LATENT')); // ["VAEDecode", "LatentUpscale"]
```

### Python

```python
import json

# Load knowledge base
with open('knowledge/base-nodes.json', 'r') as f:
    base_nodes = json.load(f)

def get_node_info(node_name):
    return base_nodes['nodes'].get(node_name)

def search_nodes(category):
    return {
        name: info 
        for name, info in base_nodes['nodes'].items()
        if info['category'] == category
    }

# Usage
ksampler = get_node_info('KSampler')
print(ksampler['display_name'])  # KSampler
```

***

## 🤖 MCP Server Integration

### MCP Tools Implementation

```typescript
// src/mcp-server.ts
const tools = [
  {
    name: "list_nodes",
    description: "List all available ComfyUI nodes",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] }
      }
    }
  },
  {
    name: "get_node_info", 
    description: "Get detailed information about a node",
    inputSchema: {
      type: "object",
      properties: { node_name: { type: "string" } },
      required: ["node_name"]
    }
  },
  {
    name: "find_compatible",
    description: "Find nodes compatible with given input type",
    inputSchema: {
      type: "object",
      properties: { input_type: { type: "string" } },
      required: ["input_type"]
    }
  }
];

async function executeTool(toolName: string, args: any) {
  switch (toolName) {
    case 'list_nodes':
      return Object.keys(knowledgeBase.base.nodes);
    
    case 'get_node_info':
      return getNodeInfo(args.node_name);
    
    case 'find_compatible':
      return findCompatible(args.input_type);
  }
}
```

### Claude Desktop Usage

```
User: "What nodes can be connected after KSampler?"

AI: [mcp_call: find_compatible, {"input_type": "LATENT"}]

AI Response: After KSampler (outputs LATENT) you can connect:
- VAEDecode (converts to IMAGE)
- LatentUpscale (scaling)
- KSampler (chain sampling)
```

***

## 🔍 Query Patterns

### 1. **Search by category**

```typescript
function findByCategory(category: string): NodeDescription[] {
  return Object.values(knowledgeBase.base.nodes).filter(
    (node: any) => node.category === category
  );
}

// Usage
const samplers = findByCategory('sampling');
```

### 2. **High-priority nodes**

```typescript
const essentialNodes = Object.entries(knowledgeBase.base.nodes)
  .filter(([_, node]: [string, any]) => node.priority === 'high')
  .map(([name, node]: [string, any]) => ({ name, ...node }));
```

### 3. **Workflow validation**

```typescript
function validateConnection(fromNode: string, toNode: string): boolean {
  const fromInfo = getNodeInfo(fromNode);
  const toInfo = getNodeInfo(toNode);
  
  // Check if first output of fromNode matches first input of toNode
  const fromOutput = fromInfo?.return_types[0];
  const toInput = Object.keys(toInfo?.input_types.required || {})[0];
  
  return knowledgeBase.compatibility.data_types[fromOutput]?.consumers?.includes(toNode) || false;
}
```

***

## 📈 Advanced Queries

### 4. **Smart node suggestions**

```typescript
function suggestNodes(inputType: string, exclude: string[] = []): NodeDescription[] {
  const compatible = findCompatible(inputType);
  return compatible
    .filter(name => !exclude.includes(name))
    .map(name => getNodeInfo(name)!)
    .sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0));
}

// Usage
const afterLatent = suggestNodes('LATENT', ['KSampler']);
```

### 5. **Workflow pattern matching**

```typescript
const patterns = {
  t2i: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler', 'VAEDecode'],
  img2img: ['LoadImage', 'VAEEncode', 'KSampler', 'VAEDecode']
};

function findWorkflowPattern(nodes: string[]): string {
  return Object.entries(patterns).find(([_, pattern]) => 
    nodes.every(node => pattern.includes(node))
  )?.[0] || 'custom';
}
```

***

## 🖥️ Web UI Integration

### React/Vue component

```tsx
interface NodeInfo {
  display_name: string;
  category: string;
  input_types: Record<string, any>;
}

function NodeCatalog({ nodes }: { nodes: NodeInfo[] }) {
  return (
    <div className="node-catalog">
      {nodes.map(node => (
        <NodeCard key={node.display_name} node={node} />
      ))}
    </div>
  );
}
```

### Search component

```tsx
function NodeSearch({ onSelect }: { onSelect: (node: NodeInfo) => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    return allNodes.filter(node => 
      node.display_name.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <div>
      <input 
        placeholder="Search nodes..."
        onChange={e => setQuery(e.target.value)}
      />
      {filtered.slice(0, 10).map(node => (
        <div key={node.display_name} onClick={() => onSelect(node)}>
          {node.display_name} ({node.category})
        </div>
      ))}
    </div>
  );
}
```

***

## 🔄 Auto-updating Knowledge Base

### Watcher script

```typescript
// watch-knowledge.ts
import chokidar from 'chokidar';
import { KnowledgeBaseUpdater } from './node-discovery/updater';

const updater = new KnowledgeBaseUpdater();

chokidar.watch('ComfyUI/custom_nodes').on('addDir', async () => {
  console.log('New custom nodes detected, rescanning...');
  await updater.scanAndUpdate();
});
```

### Cron job

```bash
# ~/.crontab
0 2 * * 0 cd /path/to/project && npm run scan
```

***

## 🎨 UI Components Reference

### Node Card Template

```tsx
function NodeCard({ node }: { node: NodeInfo }) {
  return (
    <div className="node-card">
      <h3>{node.display_name}</h3>
      <div className="category">{node.category}</div>
      <div className="priority">{node.priority.toUpperCase()}</div>
      
      <div className="inputs">
        {Object.entries(node.input_types.required).map(([name, info]) => (
          <InputWidget key={name} name={name} info={info} />
        ))}
      </div>
      
      <div className="outputs">
        {node.return_types.map(type => (
          <OutputWidget key={type} type={type} />
        ))}
      </div>
    </div>
  );
}
```

***

## 📊 Query Examples

### Production queries

```typescript
// 1. Essential nodes for new users
const starterNodes = Object.values(knowledgeBase.base.nodes)
  .filter((node: any) => node.priority === 'high');

// 2. Image processing pipeline
const imageNodes = findByCategory('image');

// 3. What's new (compare with ComfyUI API)
const liveNodes = await scanner.scanLiveInstance();
const newNodes = Array.from(liveNodes.keys())
  .filter(name => !knowledgeBase.base.nodes[name]);

// 4. Popular custom nodes
const popularCustom = Object.values(knowledgeBase.custom.node_packs)
  .filter((pack: any) => pack.priority === 'high');
```

***

## 🧪 Validation & Testing

### Schema validation

```typescript
import Ajv from 'ajv';
const ajv = new Ajv();

const nodeSchema = {
  type: 'object',
  properties: {
    display_name: { type: 'string' },
    category: { type: 'string' },
    input_types: { type: 'object' },
    return_types: { type: 'array', items: { type: 'string' } },
    priority: { enum: ['high', 'medium', 'low'] }
  },
  required: ['display_name', 'category']
};

const validateNode = ajv.compile(nodeSchema);
```

### Integrity checks

```typescript
function validateKnowledgeBase() {
  // Check all nodes have required fields
  // Validate type compatibility
  // Check priority distribution
  // Generate coverage report
}
```

***

## 🚀 Deployment Patterns

### 1. **Static files** (simplest)

```
Copy knowledge/ to your MCP server
Load JSON on startup
Manual updates via git pull
```

### 2. **Live sync** (recommended)

```
npm run scan -- --cron
Auto-update knowledge base
Restart services on major changes
```

### 3. **Distributed** (production)

```
Central knowledge base repo
Multiple MCP instances sync via git
Webhook notifications on updates
```

***

## 📈 Performance Tips

```
✅ Load once at startup (not every time)
✅ Use object cache (Map<string, NodeInfo>)
✅ Index by category/priority
✅ Compress JSON for transmission
✅ Lazy load custom nodes
```

### Memory usage

```
base-nodes.json: ~500KB (50 nodes)
custom-nodes.json: ~200KB (15 packs)
compatibility.json: ~150KB
Total: ~850KB → OK for MCP context
```

***

## 🎯 Quick Start Examples

### 1. **Load and query**

```bash
# 1. Load base
node -e "
const nodes = require('./knowledge/base-nodes.json');
console.log('High priority nodes:', 
  Object.keys(nodes.nodes).filter(k => nodes.nodes[k].priority === 'high')
);
"

# 2. Find image nodes
jq '.nodes | to_entries[] | select(.value.category | contains("image")) | .key' knowledge/base-nodes.json
```

### 2. **MCP tool test**

```
User: "Tell me about KSampler"
AI: Calls get_node_info("KSampler")
AI: Returns structured info + use cases
```

***

**Knowledge Base Ready for Production! 🚀**

*Version: 1.0.0*  
*Total Nodes: 65+*  
*Coverage: Base + Popular Custom*  
*Formats: TypeScript/Python/MCP compatible*
