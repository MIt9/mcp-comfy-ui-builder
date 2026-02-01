# 🚀 ComfyUI API Quick Reference
> Quick reference guide for all endpoints, curl examples, and most common patterns
## 📋 Endpoints Table
| Endpoint | Method | Purpose | Parameters | Response | Example curl | Use Case |
|----------|--------|---------|-----------|-----------|-------------|----------|
| `/object_info` | **GET** | 🔍 Node discovery | None | JSON with all node definitions | `curl http://127.0.0.1:8188/object_info` | **Node Discovery** - get INPUT/OUTPUT types |
| `/prompt` | **POST** | ▶️ Execute workflow | JSON workflow | `{"prompt_id": "..."}` | `curl -X POST -d @workflow.json http://127.0.0.1:8188/prompt` | **Main** - start generation |
| `/history` | **GET** | 📜 History | None | Array of completed prompts | `curl http://127.0.0.1:8188/history` | Get results from previous runs |
| `/history/{prompt_id}` | **GET** | 📋 Run details | prompt_id | JSON with outputs | `curl http://127.0.0.1:8188/history/prompt_id` | Get images from specific run |
| `/ws` | **WebSocket** | 📡 Live monitoring | `clientId=unique` | Real-time updates | `wscat -c ws://127.0.0.1:8188/ws?clientId=test` | **Live progress** + images |
| `/system_stats` | **GET** | 🖥️ System metrics | None | GPU/VRAM/RAM | `curl http://127.0.0.1:8188/system_stats` | Resource monitoring |
| `/queue` | **GET** | ⏳ Queue | None | Queue length | `curl http://127.0.0.1:8188/queue` | Task queue status |
| `/view` | **GET** | 🖼️ Image | `filename`, `type=output` | Image file | `curl "http://127.0.0.1:8188/view?filename=img.png&type=output"` | Get generated image |

***

## 💡 Most Common Commands
### 🔍 **1. Check that ComfyUI is running**
```bash
# Basic health check
curl http://127.0.0.1:8188/system_stats

# Check number of nodes
curl http://127.0.0.1:8188/object_info | jq 'keys | length'

# Queue status
curl http://127.0.0.1:8188/queue
```

### 🕵️ **2. Node Discovery (for Node Discovery System)**
```bash
# All nodes (save to file)
curl http://127.0.0.1:8188/object_info > all-nodes.json

# One node
curl http://127.0.0.1:8188/object_info | jq '."KSampler"'

# Custom nodes only
curl http://127.0.0.1:8188/object_info | jq 'keys | map(select(startswith("WAS_")))'

# By category
curl http://127.0.0.1:8188/object_info | jq '. | to_entries[] | select(.value.category == "sampling") | .key'
```

### ▶️ **3. Run workflow**
```bash
# From file
curl -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d @workflow.json

# Inline JSON (simple example)
curl -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "1": {
      "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"},
      "class_type": "CheckpointLoaderSimple"
    }
  }'
```

### 📡 **4. Live monitoring (WebSocket)**
```bash
# Install wscat
npm i -g wscat

# Connect (get clientId)
CLIENT_ID=$(uuidgen)
wscat -c "ws://127.0.0.1:8188/ws?clientId=$CLIENT_ID"

# After connecting, send prompt via /prompt
# Will receive live updates here
```

### 🖼️ **5. Get images**
```bash
# From history first get filenames
curl http://127.0.0.1:8188/history | jq '.[].outputs["7"]["images"]'

# Get specific image
curl "http://127.0.0.1:8188/view?filename=00001.png&type=output&subfolder=output" > image.png
```

***

## 🧩 **Workflow Patterns**
### Pattern 1: **Full Automation**
```bash
#!/bin/bash
# 1. Discover nodes
curl http://127.0.0.1:8188/object_info > nodes.json

# 2. Build workflow (your logic)
node build-workflow.js > workflow.json

# 3. Execute
curl -X POST -d @workflow.json http://127.0.0.1:8188/prompt

# 4. Monitor
wscat -c ws://127.0.0.1:8188/ws?clientId=batch-1
```

### Pattern 2: **Batch Processing**
```bash
#!/bin/bash
# Submit 10 prompts
for i in {1..10}; do
  curl -X POST -d @workflow-$i.json http://127.0.0.1:8188/prompt &
done

# Monitor queue
watch -n 5 'curl http://127.0.0.1:8188/queue'
```

### Pattern 3: **Node Discovery for documentation**
```bash
#!/bin/bash
# For Node Discovery System
curl http://127.0.0.1:8188/object_info | \
  jq '. | to_entries[] | 
      select(.key | startswith("WAS_")) | 
      {class_name: .key, input_types: .value.input, category: .value.category}' > \
  new-nodes.json

# Each node ready for Claude prompt
```

***

## 🔍 **JQ Cheatsheet for /object_info**
```bash
# Number of nodes
jq 'keys | length' object_info.json

# List all nodes
jq -r 'keys[]' object_info.json

# Nodes by category
jq -r '. | to_entries[] | select(.value.category == "image") | .key' object_info.json

# INPUT_TYPES for specific node
jq '."KSampler".input.required' object_info.json

# Search nodes with specific input type
jq '. | to_entries[] | 
    select(.value.input.required.model // empty) | 
    .key' object_info.json

# Custom nodes (by naming convention)
jq -r 'keys | map(select(startswith("WAS_") or startswith("Impact_")))[]' object_info.json
```

***

## 📡 **WebSocket Messages Reference**
### Incoming (Client → Server)
```json
{"type": "status", "data": {"node_id": "6", "title": "KSampler"}}
```

### Outgoing (Server → Client)
```json
// Progress
{"type": "progress", "data": {"value": 0.5}}

// Node status
{"type": "status", "data": {
  "node_id": "6",
  "title": "KSampler",
  "status": {"title": "Progress", "value": 0.25}
}}

// Execution complete
{"type": "executed", "data": {
  "node_id": "7",
  "output": {
    "images": [{"filename": "00001.png", "subfolder": "output", "type": "output"}]
  }
}}

// Workflow complete
{"type": "execution_cached", "nodes": {...}}
```

***

## 🛠️ **Troubleshooting**
| Problem | Solution |
|---------|----------|
| `Connection refused` | `python main.py --listen` |
| `Empty /object_info` | Restart ComfyUI after custom nodes |
| `WebSocket: clientId required` | `?clientId=$(uuidgen)` |
| `Out of memory` | `curl /system_stats`, unload models |
| `Queue full` | `curl /queue`, wait or scale |
| `Filename not found` | Check `subfolder=output`, `type=output` |

***

## ⚙️ **Configuration**
### Starting ComfyUI for API
```bash
# Local development
python main.py

# Network access
python main.py --listen 0.0.0.0 --port 8188

# High performance
python main.py --listen --force-fp16 --dont-upcast-attention

# With custom nodes
cd ComfyUI
pip install -r requirements.txt
python main.py --listen
```

### Docker
```bash
docker run -it --gpus all -p 8188:8188 comfyui:latest
```

***

## 🔗 **Related Resources**
| Resource | URL |
|----------|-----|
| ComfyUI GitHub | https://github.com/comfyanonymous/ComfyUI |
| ComfyUI Manager | https://github.com/ltdrdata/ComfyUI-Manager |
| API Docs (Swagger) | http://127.0.0.1:8188/docs |
| Custom Nodes List | https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/custom-node-list.json |
| Node Registry | https://comfyregistry.org/ |

***

## 🎯 **For Node Discovery System**
### Quick extract of new nodes:
```bash
#!/bin/bash
# Save current nodes
curl http://127.0.0.1:8188/object_info | jq -r 'keys[]' > current-nodes.txt

# After installing new custom nodes + restart
curl http://127.0.0.1:8188/object_info | jq -r 'keys[]' > new-nodes.txt

# New nodes only
comm -13 current-nodes.txt new-nodes.txt

# Full info for new nodes
curl http://127.0.0.1:8188/object_info | jq '. | with_entries(select(.key | IN(["WAS_Image_Blend"])))'
```

***

**Quick Reference Complete! Copy-paste ready 🚀**

*Version: 1.0.0*  
*Updated: 2026-02-01*  
*Endpoints: 8 core APIs*  
*Ready for production use!*
