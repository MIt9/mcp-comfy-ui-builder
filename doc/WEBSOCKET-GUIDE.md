# WebSocket Real-Time Execution Guide

> Real-time execution tracking with WebSocket support in mcp-comfy-ui-builder v0.5.0+

## Overview

WebSocket support provides **sub-second progress updates** with automatic fallback to polling for reliability. Reduces network overhead by **90%** compared to polling-based execution.

### Benefits

- **Real-time progress:** <100ms latency (vs 1.5s polling)
- **Node-level granularity:** See exactly which node is executing
- **Reduced network traffic:** Single connection vs multiple HTTP requests
- **Batch optimization:** Shared connection for concurrent workflows
- **Zero breaking changes:** Automatic fallback to polling

---

## Architecture

### Hybrid Approach

```
┌─────────────────────────────────────────┐
│  submitPromptAndWaitWithProgress()      │
└──────────────┬──────────────────────────┘
               │
               ├─→ Try WebSocket
               │   ├─→ Success: Real-time updates
               │   └─→ Failure: ↓
               │
               └─→ Fallback to Polling
                   └─→ 1.5s intervals
```

### Connection Management

- **Singleton pattern:** Single shared WebSocket per process
- **Auto-reconnect:** Exponential backoff (1s → 30s)
- **Keepalive:** Ping/pong every 30s
- **Graceful cleanup:** Subscription-based lifecycle

---

## Usage

### 1. Basic Execution with Progress

```typescript
import { submitPromptAndWaitWithProgress } from './comfyui-client.js';

const workflow = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
  "3": { class_type: "KSampler", inputs: { steps: 20 } },
  "7": { class_type: "SaveImage", inputs: {} }
};

// With progress callback
const result = await submitPromptAndWaitWithProgress(
  workflow,
  300000, // 5 minute timeout
  (progress) => {
    console.log(`Status: ${progress.status}`);
    console.log(`Node: ${progress.current_node}`);
    console.log(`Progress: ${(progress.current_node_progress * 100).toFixed(1)}%`);
    console.log(`Queue: ${progress.queue_position || 0} remaining`);
  }
);

console.log(`Result: ${result.status}`);
console.log(`Images:`, result.outputs);
```

### 2. Check WebSocket Availability

```typescript
import { isWebSocketAvailable } from './comfyui-client.js';

if (await isWebSocketAvailable()) {
  console.log('WebSocket connected - real-time updates enabled');
} else {
  console.log('WebSocket unavailable - using polling fallback');
}
```

### 3. Direct WebSocket Client Usage

```typescript
import { getWSClient } from './comfyui-ws-client.js';

const wsClient = getWSClient();
await wsClient.connect();

// Subscribe to prompt execution
const subscription = wsClient.subscribe(
  'prompt-id-123',
  (progress) => {
    // Progress callback
    console.log(`Current node: ${progress.current_node}`);
    console.log(`Progress: ${progress.current_node_progress}`);
    console.log(`Completed nodes:`, progress.completed_nodes);
  },
  (error) => {
    // Error callback
    console.error(`Execution failed at node ${error.node_id}:`, error.message);
  }
);

// Get current progress synchronously
const currentProgress = wsClient.getProgress('prompt-id-123');

// Cleanup when done
subscription.unsubscribe();
```

### 4. Batch Execution (Optimized)

```typescript
import { executeBatch } from './workflow/batch-executor.js';

// Pre-connects WebSocket, shares connection across all workflows
const results = await executeBatch({
  workflows: [workflow1, workflow2, workflow3, workflow4, workflow5],
  concurrency: 3,
  timeoutMs: 300000
});

// 90% reduced network traffic compared to polling
results.forEach((result, i) => {
  console.log(`Workflow ${i}: ${result.status}`);
});
```

### 5. Chain Execution (Sequential)

```typescript
import { executeChain } from './workflow/chainer.js';

// Pre-connects WebSocket for optimized sequential execution
const results = await executeChain([
  { workflow: txt2imgWorkflow },
  { workflow: upscaleWorkflow, inputFrom: { step: 0, outputNode: '7', outputIndex: 0 }, outputTo: 'image' },
  { workflow: captionWorkflow, inputFrom: { step: 1, outputNode: '9', outputIndex: 0 }, outputTo: 'image' }
]);

// Real-time progress for each step
console.log('Chain completed:', results.map(r => r.status));
```

---

## MCP Tools

### execute_workflow_sync (Enhanced)

**New parameter:** `stream_progress` (default: true)

```json
{
  "workflow": "{ ... }",
  "timeout_ms": 300000,
  "stream_progress": true
}
```

**Response includes:**

```json
{
  "prompt_id": "abc-123",
  "status": "completed",
  "progress_method": "websocket",
  "progress_log": [
    "Queued (position: 2)",
    "Node 6 started",
    "Node 6 progress: 25%",
    "Node 6 progress: 50%",
    "Node 6 completed",
    "Node 7 started",
    "Node 7 completed",
    "Execution finished"
  ],
  "outputs": { ... }
}
```

**Recovery when the result is lost (e.g. client-side timeout, "No result received from client-side tool execution"):** The server always returns `prompt_id` when the workflow was submitted. If the client did not receive it, use **get_history(limit=5)** to list the last N runs (with prompt_id and outputs), or **get_last_output()** to get the latest completed run’s first image (prompt_id, filename, view_url). Then use **download_by_filename(filename, dest_path)** to save the file without needing prompt_id.

### get_execution_progress (Enhanced)

**Now checks WebSocket first:**

```json
{
  "prompt_id": "abc-123"
}
```

**Response:**

```json
{
  "prompt_id": "abc-123",
  "status": "executing",
  "current_node": "6",
  "current_node_progress": 0.65,
  "queue_position": 0,
  "completed_nodes": ["1", "2", "3"],
  "cached_nodes": ["4"],
  "method": "websocket"
}
```

### execute_workflow_stream (NEW)

**Requires WebSocket connection:**

```json
{
  "workflow": "{ ... }",
  "timeout_ms": 300000
}
```

**Response includes event history:**

```json
{
  "prompt_id": "abc-123",
  "status": "completed",
  "outputs": { ... },
  "events": [
    { "type": "executing", "data": { "node": "6" } },
    { "type": "progress", "data": { "value": 10, "max": 20 } },
    { "type": "executed", "data": { "node": "7", "output": { ... } } }
  ]
}
```

---

## Event Types

### ExecutionProgress Interface

```typescript
interface ExecutionProgress {
  prompt_id: string;
  status: 'queued' | 'executing' | 'completed' | 'failed';
  current_node?: string;             // Node ID currently executing
  current_node_progress?: number;    // 0-1 (percentage)
  queue_position?: number;           // Position in queue
  completed_nodes: string[];         // Node IDs completed
  cached_nodes: string[];            // Node IDs using cache
  outputs: Record<string, HistoryNodeOutput>;  // Node outputs
  error?: {
    node_id: string;
    message: string;
    type: string;
  };
}
```

### WebSocket Events

#### executing
- **Node started:** `{ node: "6" }`
- **Execution finished:** `{ node: null }`

#### progress
- **Real-time progress:** `{ value: 5, max: 20 }` = 25%

#### executed
- **Node completed:** `{ node: "7", output: { images: [...] } }`

#### status
- **Queue update:** `{ exec_info: { queue_remaining: 3 } }`

#### execution_error
- **Execution failed:** `{ node_id: "6", exception_message: "..." }`

#### execution_cached
- **Cached nodes:** `{ nodes: ["1", "2"] }` = skip execution

---

## Connection Configuration

### Environment Variables

```bash
# ComfyUI host (http/https auto-converted to ws/wss)
export COMFYUI_HOST="http://localhost:8188"

# WebSocket URL is automatically constructed:
# ws://localhost:8188/ws?clientId={uuid}
```

### Docker Setup

```yaml
services:
  comfyui:
    ports:
      - "8188:8188"

  mcp-server:
    environment:
      - COMFYUI_HOST=http://comfyui:8188
    depends_on:
      - comfyui
```

---

## Performance

### Latency Comparison

| Method | Update Frequency | Latency |
|--------|-----------------|---------|
| **WebSocket** | Real-time | <100ms |
| Polling | Fixed interval | ~1.5s |

### Network Traffic

| Scenario | WebSocket | Polling | Reduction |
|----------|-----------|---------|-----------|
| Single workflow (20 steps) | 1 connection | 15 requests | -93% |
| Batch (5 workflows) | 1 connection | 75 requests | -99% |
| Chain (3 steps) | 1 connection | 45 requests | -98% |

### Concurrency

- **Polling:** 5 workflows = 5 concurrent polling loops
- **WebSocket:** 5 workflows = 1 shared connection
- **Result:** 10x better scaling

---

## Error Handling

### Auto-reconnect

```typescript
// Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
const wsClient = getWSClient();
await wsClient.connect(); // Auto-reconnects on disconnect
```

### Graceful Fallback

```typescript
// Automatically falls back to polling if WebSocket fails
const result = await submitPromptAndWaitWithProgress(workflow);
// Always completes successfully (WebSocket OR polling)
```

### Connection Status

```typescript
const wsClient = getWSClient();

if (wsClient.isConnected()) {
  console.log('WebSocket connected');
} else {
  console.log('WebSocket disconnected - will reconnect automatically');
}
```

---

## Testing

### Unit Tests (Mocked WebSocket)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getWSClient } from '../src/comfyui-ws-client.js';

// Mock WebSocket for testing
vi.mock('ws', () => ({ default: MockWebSocket }));

describe('WebSocket Client', () => {
  it('connects and receives events', async () => {
    const client = getWSClient();
    await client.connect();

    const progressCallback = vi.fn();
    client.subscribe('p1', progressCallback, vi.fn());

    // Simulate event
    const ws = (client as any).ws;
    ws.emit('message', Buffer.from(JSON.stringify({
      type: 'executing',
      data: { prompt_id: 'p1', node: 'node1' }
    })));

    expect(progressCallback).toHaveBeenCalledWith(
      expect.objectContaining({ current_node: 'node1' })
    );
  });
});
```

### Manual Testing

```bash
# Test WebSocket connection
npm run build
npm run mcp

# In Claude Desktop, run:
execute_workflow_sync with stream_progress=true

# Check progress_method in response:
# "websocket" = success
# "polling" = fallback (check COMFYUI_HOST)
```

---

## Troubleshooting

### WebSocket Not Connecting

**Symptom:** `progress_method: "polling"` in all responses

**Solutions:**

1. **Check ComfyUI is running:**
   ```bash
   curl http://localhost:8188/system_stats
   ```

2. **Check WebSocket endpoint:**
   ```bash
   npm install -g wscat
   wscat -c ws://localhost:8188/ws?clientId=test
   ```

3. **Check COMFYUI_HOST:**
   ```bash
   echo $COMFYUI_HOST
   # Should be: http://localhost:8188
   ```

4. **Docker networking:**
   ```yaml
   # Use service name instead of localhost
   COMFYUI_HOST: http://comfyui:8188
   ```

### Connection Drops

**Symptom:** WebSocket disconnects frequently

**Solutions:**

- **Auto-reconnect is automatic** - check logs for reconnection attempts
- **Increase keepalive frequency** - edit PING_INTERVAL_MS in comfyui-ws-client.ts
- **Check firewall/proxy** - may be closing idle connections

### Memory Leaks

**Symptom:** Memory grows over time

**Solutions:**

1. **Always unsubscribe:**
   ```typescript
   const sub = wsClient.subscribe(...);
   // ... later
   sub.unsubscribe(); // IMPORTANT!
   ```

2. **Reset client if needed:**
   ```typescript
   import { resetWSClient } from './comfyui-ws-client.js';
   resetWSClient(); // Creates new singleton
   ```

---

## Migration Guide

### From Polling to WebSocket

**No code changes required!** WebSocket is transparent:

```typescript
// Old code (still works)
const result = await submitPromptAndWait(workflow);

// New code (uses WebSocket automatically)
const result = await submitPromptAndWaitWithProgress(workflow);
```

### Adding Progress Callbacks

```typescript
// Before (no progress updates)
const result = await submitPromptAndWait(workflow);

// After (real-time progress)
const result = await submitPromptAndWaitWithProgress(
  workflow,
  300000,
  (progress) => {
    console.log(`${progress.status}: ${progress.current_node || 'queued'}`);
  }
);
```

---

## Best Practices

### 1. Pre-connect for Batch/Chain

```typescript
// Pre-connect before batch
const wsClient = getWSClient();
await wsClient.connect();

// All workflows share connection
await executeBatch({ workflows: [...] });
```

### 2. Handle Progress Updates Efficiently

```typescript
// Don't block on progress callbacks
const result = await submitPromptAndWaitWithProgress(
  workflow,
  300000,
  (progress) => {
    // Fast, non-blocking operation
    progressTracker.update(progress);
  }
);
```

### 3. Always Clean Up Subscriptions

```typescript
const sub = wsClient.subscribe(promptId, onProgress, onError);
try {
  // ... do work
} finally {
  sub.unsubscribe(); // CRITICAL
}
```

### 4. Use Hybrid Execution

```typescript
// Don't check availability manually - just use it
// Fallback is automatic
const result = await submitPromptAndWaitWithProgress(workflow);
```

---

## Advanced Usage

### Custom Subscription Management

```typescript
import { getWSClient } from './comfyui-ws-client.js';

class WorkflowMonitor {
  private subscriptions = new Map();

  async trackWorkflow(promptId: string) {
    const wsClient = getWSClient();
    await wsClient.connect();

    const sub = wsClient.subscribe(
      promptId,
      (progress) => this.handleProgress(promptId, progress),
      (error) => this.handleError(promptId, error)
    );

    this.subscriptions.set(promptId, sub);
  }

  stopTracking(promptId: string) {
    const sub = this.subscriptions.get(promptId);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(promptId);
    }
  }

  private handleProgress(promptId: string, progress: ExecutionProgress) {
    // Your custom logic
  }

  private handleError(promptId: string, error: any) {
    // Your custom error handling
  }
}
```

### Monitoring Multiple Workflows

```typescript
const wsClient = getWSClient();
await wsClient.connect();

// Track multiple concurrent workflows
const workflows = ['p1', 'p2', 'p3', 'p4', 'p5'];
const subscriptions = workflows.map(id =>
  wsClient.subscribe(
    id,
    (progress) => console.log(`${id}: ${progress.status}`),
    (error) => console.error(`${id}: failed`)
  )
);

// All share single WebSocket connection
// Cleanup
subscriptions.forEach(sub => sub.unsubscribe());
```

---

## See Also

- [MCP-SETUP.md](./MCP-SETUP.md) - Tool reference
- [GETTING-STARTED.md](./GETTING-STARTED.md) - Quick start guide
- [comfyui-api-quick-reference.md](./comfyui-api-quick-reference.md) - API reference
- [CHANGELOG.md](../CHANGELOG.md) - Version history

---

*Guide version: 1.0.0*
*Project version: 0.5.0+*
*Updated: 2026-02-02*
