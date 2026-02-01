/**
 * Save/load workflows to/from workflows/*.json (relative to cwd).
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComfyUIWorkflow } from '../types/comfyui-api-types.js';

const WORKFLOWS_DIR = 'workflows';

/** Sanitize name for filename: alphanumeric, dash, underscore only. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'workflow';
}

/**
 * Save workflow JSON to workflows/<name>.json. Creates workflows/ if missing.
 * Returns absolute path to saved file.
 */
export async function saveWorkflow(name: string, workflow: ComfyUIWorkflow): Promise<string> {
  const safe = sanitizeName(name);
  const dir = join(process.cwd(), WORKFLOWS_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${safe}.json`);
  await writeFile(filePath, JSON.stringify(workflow, null, 2), 'utf8');
  return filePath;
}

export interface SavedWorkflowEntry {
  name: string;
  path: string;
}

/**
 * List saved workflows (names and paths) from workflows/.
 * Returns empty array if directory does not exist or has no .json files.
 */
export async function listSavedWorkflows(): Promise<SavedWorkflowEntry[]> {
  const dir = join(process.cwd(), WORKFLOWS_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((e) => e.endsWith('.json'));
  const result: SavedWorkflowEntry[] = [];
  for (const f of jsonFiles) {
    result.push({
      name: f.replace(/\.json$/, ''),
      path: join(dir, f),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load workflow by name (filename without .json) or by path.
 * If name looks like a path (contains / or \), treats as path; otherwise looks in workflows/<name>.json.
 */
export async function loadWorkflow(nameOrPath: string): Promise<ComfyUIWorkflow> {
  const isPath = /[\\/]/.test(nameOrPath);
  const filePath = isPath ? nameOrPath : join(process.cwd(), WORKFLOWS_DIR, `${sanitizeName(nameOrPath)}.json`);
  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid workflow JSON: expected object');
  }
  return parsed as ComfyUIWorkflow;
}
