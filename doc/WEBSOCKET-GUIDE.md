# Execution and WebSocket Guide

The MCP API uses `execute_workflow` to submit workflows and `get_execution` to inspect existing runs. Set `COMFYUI_HOST` to the running ComfyUI HTTP endpoint, for example `http://127.0.0.1:8188`.

## Submit and wait

Call `execute_workflow` with workflow JSON. Waiting is enabled by default:

```json
{
  "workflow": "{ ... }",
  "wait": true,
  "timeout_ms": 300000,
  "progress_transport": "auto"
}
```

The result includes `prompt_id`, `status` (`completed`, `failed`, or `timeout`), and available node outputs. Outputs can include images, text, and other node-specific data. Omitted timeouts use the system resource recommendation, or 300000 ms if resource stats are unavailable. Resource analysis may reject a resolution that exceeds the recommended GPU limits before submission.

Transport choices:

| Value | Behavior |
|---|---|
| `auto` | Uses WebSocket progress and history polling in parallel; the first final result wins. Works when WebSocket events are unavailable. |
| `websocket` | Requires a successful WebSocket connection before submission. After subscribing, reads history once to recover a fast run that already finished; then waits using WebSocket with no recurring polling fallback. |
| `polling` | Queries execution history without opening a WebSocket for this wait. |

The process shares one WebSocket client between subscriptions. It supports reconnection with exponential backoff and ping/pong keepalive. Automatic transport still makes HTTP polling requests; network traffic depends on execution duration and transport selection.

When a terminal WebSocket event has no outputs (for example, cached execution), the client reads history once to recover recorded outputs. This completion reconciliation also applies to strict WebSocket mode and does not start a polling loop.

## Collect progress events

Set `include_events=true` when the returned result should contain recent progress snapshots:

```json
{
  "workflow": "{ ... }",
  "include_events": true,
  "progress_transport": "auto"
}
```

The result adds `event_count` and `events`. `event_count` counts all observed snapshots; `events` contains at most the last 10. These are normalized `ExecutionProgress` snapshots rather than raw ComfyUI WebSocket messages. Events are collected during the tool call and returned with its result. In automatic mode, polling may finish before WebSocket events arrive, so the event list can be empty.

`include_events` requires `wait=true` and transport `auto` or `websocket`; it cannot be combined with `polling`.

## Submit without waiting

```json
{
  "workflow": "{ ... }",
  "wait": false
}
```

Returns `{ "prompt_id": "abc-123", "status": "queued" }`. With `wait=false`, omit `include_events`, `timeout_ms`, and an explicit progress transport. Use `get_execution` for subsequent inspection.

## Inspect a submitted run

Call `get_execution` with a known prompt ID and one of three views:

| View | Result |
|---|---|
| `summary` (default) | Recorded status, full outputs, image view URLs, and recorded errors if present. |
| `progress` | Cached WebSocket state when available; otherwise recorded history or current queue state. |
| `errors` | Full recorded exception details, including traceback. |

```json
{
  "prompt_id": "abc-123",
  "view": "progress"
}
```

WebSocket progress includes fields such as `current_node`, `current_node_progress` (0–1), `completed_nodes`, `cached_nodes`, and available `outputs`, with `method="websocket"`. The polling view reports `method="polling"`; it cannot provide node-level percentages that ComfyUI has not recorded in history.

No recorded history does not necessarily mean failure. The run may be queued or still executing; use the progress view to check the queue.

## Recover results and download files

When submission succeeded but waiting failed, `execute_workflow` retains the known `prompt_id` in its error result. A timeout does not cancel the ComfyUI job. Inspect the run later with `get_execution`.

If the client lost the entire response, use `get_history(limit=5)` to identify the run, or `list_outputs(selector="latest_image")` to find the latest history entry containing an image. Retrieve its files with `download_outputs`:

```json
{
  "source": { "kind": "file", "filename": "ComfyUI_00001_.png" },
  "destination": { "kind": "file", "path": "/tmp/result.png" }
}
```

Failed runs can still have partial outputs. Inspect those before resubmitting. Use `interrupt_execution` to request cancellation, and `list_queue` to check running and pending jobs.

## Batch and chain execution

`execute_batch` handles independent workflow documents with bounded concurrency. `execute_chain` runs dependent steps sequentially and passes an output image between steps. Both remain separate tools because their input structures and dependency semantics differ.

## Using the TypeScript client

```typescript
import { submitPrompt, waitForCompletion } from '../src/comfyui-client.js';

const { prompt_id } = await submitPrompt(workflow);
const result = await waitForCompletion(
  prompt_id,
  300000,
  (progress) => console.log(progress.current_node, progress.current_node_progress),
  'auto',
);
```

The fourth argument selects `auto`, `websocket`, or `polling`. The existing `submitPromptAndWaitWithProgress` helper continues to use automatic transport. `isWebSocketAvailable()` reports whether the shared client is currently connected; it does not attempt a connection. For direct subscriptions, call `getWSClient().connect()`, subscribe to a prompt, and unsubscribe when finished.

## Troubleshooting

- Check `COMFYUI_HOST` and confirm that `GET /system_stats` responds. In Docker, use the ComfyUI service hostname rather than `localhost` in the MCP container.
- Ensure the proxy supports the `/ws` WebSocket endpoint. An HTTP connection alone does not verify WebSocket connectivity.
- If automatic mode completes without progress snapshots, use `get_execution(view="summary")` for outputs. Some backends provide fewer WebSocket events.
- If strict WebSocket mode fails or times out, inspect the existing prompt before retrying; it may still be running. Choose automatic transport when polling fallback is desired.
- For explicit polling, leave `include_events=false`.

## Verification

```bash
npx tsc --noEmit
npx vitest run tests/execution-tools.test.ts tests/comfyui-client-transport.test.ts tests/comfyui-client-parallel-poll.test.ts tests/comfyui-client-websocket-fallback.test.ts
```

These checks cover MCP argument validation, full result output, event history bounds, error recovery, explicit transport behavior, and automatic polling fallback without requiring a live ComfyUI instance.
