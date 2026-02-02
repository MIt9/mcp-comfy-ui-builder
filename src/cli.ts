#!/usr/bin/env node
/**
 * CLI — seed, sync-manager, sync-nodes, MCP. Knowledge base filled from seed (no ComfyUI or API).
 */
import { program } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchManagerList, type ManagerListResult } from './node-discovery/scanner.js';
import { updateCompatibility } from './node-discovery/updater.js';
import { HybridNodeDiscovery } from './node-discovery/hybrid-discovery.js';
import { getObjectInfo } from './comfyui-client.js';
import { logger } from './logger.js';
import type { CustomPack, CustomNodesJson, BaseNodesJson, NodeDescription } from './types/node-types.js';

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg);
}

const knowledgePath = () => join(process.cwd(), 'knowledge');
const baseNodesPath = () => join(knowledgePath(), 'base-nodes.json');
const seedBaseNodesPath = () => join(knowledgePath(), 'seed-base-nodes.json');
const seedNodeCompatibilityPath = () => join(knowledgePath(), 'seed-node-compatibility.json');
const nodeCompatibilityPath = () => join(knowledgePath(), 'node-compatibility.json');

program
  .name('mcp-comfy-ui-builder')
  .description('ComfyUI Node Discovery: seed knowledge base, sync manager list, MCP tools')
  .version('0.1.0');

program
  .command('seed')
  .description(
    'Fill knowledge base from seed files. Merge by default; use --force to overwrite.'
  )
  .option('--force', 'Overwrite base-nodes.json and node-compatibility.json from seed')
  .action(async (opts: { force?: boolean }) => {
    const force = opts.force ?? false;
    const seedPath = seedBaseNodesPath();
    const seedCompatPath = seedNodeCompatibilityPath();
    const basePath = baseNodesPath();
    const compatPath = nodeCompatibilityPath();

    if (!existsSync(seedPath)) {
      logger.error('cli', `Seed file not found: ${seedPath}. Run from project root.`);
      process.exit(1);
    }
    if (!existsSync(seedCompatPath)) {
      logger.error('cli', `Seed compatibility file not found: ${seedCompatPath}. Run from project root.`);
      process.exit(1);
    }

    try {
      const seedData = JSON.parse(readFileSync(seedPath, 'utf8')) as BaseNodesJson;
      const seedNodes = seedData.nodes ?? {};

      let base: BaseNodesJson;
      if (force || !existsSync(basePath)) {
        base = { ...seedData, metadata: { ...seedData.metadata, last_updated: new Date().toISOString().slice(0, 10) } };
        base.metadata.total_nodes = Object.keys(base.nodes).length;
        writeFileSync(basePath, JSON.stringify(base, null, 2) + '\n', 'utf8');
        logger.info('cli', `Wrote base-nodes.json from seed (${base.metadata.total_nodes} nodes).`);
      } else {
        base = JSON.parse(readFileSync(basePath, 'utf8')) as BaseNodesJson;
        base.nodes ??= {};
        let added = 0;
        for (const [key, desc] of Object.entries(seedNodes)) {
          if (!(key in base.nodes)) {
            base.nodes[key] = desc as NodeDescription;
            added++;
          }
        }
        base.metadata ??= {};
        base.metadata.last_updated = new Date().toISOString().slice(0, 10);
        base.metadata.total_nodes = Object.keys(base.nodes).length;
        writeFileSync(basePath, JSON.stringify(base, null, 2) + '\n', 'utf8');
        logger.info('cli', `Merged seed into base-nodes.json: ${added} added, ${base.metadata.total_nodes} total.`);
      }

      if (force || !existsSync(compatPath)) {
        const seedCompat = readFileSync(seedCompatPath, 'utf8');
        writeFileSync(compatPath, seedCompat, 'utf8');
        logger.info('cli', 'Wrote node-compatibility.json from seed.');
      }

      for (const [className, desc] of Object.entries(base.nodes)) {
        updateCompatibility(className, desc as NodeDescription);
      }
      logger.info('cli', 'Refreshed node-compatibility.json from base nodes.');
    } catch (e) {
      logger.error('cli', 'Seed failed.', e);
      process.exit(1);
    }
  });

program
  .command('sync-manager')
  .description('Fetch ComfyUI-Manager custom-node-list and update custom-nodes.json')
  .action(async () => {
    try {
      const list = await fetchManagerList();
      const customNodes = (list as ManagerListResult).custom_nodes ?? [];
      const packs: CustomPack[] = customNodes.map((c: { title?: string; reference?: string; author?: string; description?: string }) => ({
        name: c.title ?? 'Unknown',
        repo: c.reference ?? '',
        author: c.author,
        priority: 'medium',
        description: c.description ?? '',
        key_nodes: [],
        use_cases: [],
      }));
      const data: CustomNodesJson = {
        metadata: {
          version: '1.0.0',
          last_updated: new Date().toISOString().slice(0, 10),
          total_packs: packs.length,
          source: 'ComfyUI-Manager custom-node-list',
        },
        packs,
      };
      const path = join(knowledgePath(), 'custom-nodes.json');
      writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
      logger.info('cli', `Updated ${path} with ${packs.length} packs.`);
    } catch (e) {
      if (isNetworkError(e)) {
        logger.error('cli', 'Failed to load custom-node-list (network or GitHub unavailable).', e);
      } else {
        logger.error('cli', 'sync-manager failed.', e);
      }
      process.exit(1);
    }
  });

program
  .command('sync-nodes')
  .description('Sync nodes from running ComfyUI (object_info) to knowledge base. Requires COMFYUI_HOST.')
  .option('-i, --interval <minutes>', 'Run repeatedly every N minutes (daemon mode). Ctrl+C to stop.')
  .action(async (opts: { interval?: string }) => {
    const loadBaseNodes = (): BaseNodesJson => {
      const path = baseNodesPath();
      if (!existsSync(path)) return { metadata: {}, nodes: {} };
      return JSON.parse(readFileSync(path, 'utf8')) as BaseNodesJson;
    };
    const discovery = new HybridNodeDiscovery({
      getObjectInfo,
      loadBaseNodes,
    });

    const runSync = async (): Promise<boolean> => {
      try {
        const result = await discovery.syncToKnowledgeBase();
        if (result.added.length > 0) {
          logger.info('cli', `sync-nodes: added ${result.added.length} nodes: ${result.added.slice(0, 10).join(', ')}${result.added.length > 10 ? '...' : ''}`);
        }
        if (result.skipped > 0) {
          logger.info('cli', `sync-nodes: ${result.skipped} nodes already in knowledge base`);
        }
        if (result.errors.length > 0) {
          for (const err of result.errors) logger.error('cli', `sync-nodes: ${err}`);
        }
        if (result.added.length === 0 && result.errors.length === 0) {
          logger.info('cli', 'sync-nodes: knowledge base is up to date');
        }
        return true;
      } catch (e) {
        if (isNetworkError(e)) {
          logger.error('cli', 'ComfyUI unavailable. Is it running? Set COMFYUI_HOST (default http://127.0.0.1:8188).', e);
        } else {
          logger.error('cli', 'sync-nodes failed.', e);
        }
        return false;
      }
    };

    const intervalMinutes = opts.interval ? parseInt(opts.interval, 10) : 0;
    if (intervalMinutes > 0) {
      logger.info('cli', `sync-nodes: daemon mode, interval ${intervalMinutes} min`);
      await runSync();
      setInterval(() => runSync(), intervalMinutes * 60 * 1000);
    } else {
      const ok = await runSync();
      process.exit(ok ? 0 : 1);
    }
  });

program.parse();
