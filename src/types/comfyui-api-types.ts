/**
 * Types for ComfyUI API: workflow JSON, history, queue.
 * See doc/comfyui-api-quick-reference.md
 */

/** One node in ComfyUI workflow: class_type + inputs (literals or [nodeId, outputIndex]). */
export interface ComfyUINodeDef {
  class_type: string;
  inputs: Record<string, unknown>;
}

/** ComfyUI workflow: node id (string) -> node definition. */
export type ComfyUIWorkflow = Record<string, ComfyUINodeDef>;

/** Response from POST /prompt. */
export interface SubmitPromptResponse {
  prompt_id: string;
}

/** Image output entry in history. */
export interface HistoryImageOutput {
  filename: string;
  subfolder?: string;
  type?: string;
}

/** Outputs of one node in history. */
export interface HistoryNodeOutput {
  images?: HistoryImageOutput[];
  [key: string]: unknown;
}

/** One prompt's entry in GET /history or /history/{id}. */
export interface HistoryEntry {
  prompt_id?: string;
  outputs?: Record<string, HistoryNodeOutput>;
  status?: { status_str?: string; messages?: unknown[] };
  [key: string]: unknown;
}

/** GET /queue response. */
export interface QueueStatus {
  queue_running: unknown[];
  queue_pending: unknown[];
}
