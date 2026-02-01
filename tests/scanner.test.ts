/**
 * Unit tests for scanner: fetchManagerList (mocked fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchManagerList } from '../src/node-discovery/scanner.js';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

describe('fetchManagerList', () => {
  it('returns parsed custom_node list', async () => {
    const fetch = (await import('node-fetch')).default as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          custom_nodes: [
            { title: 'Test Pack', reference: 'https://github.com/a/b', author: 'Author' },
          ],
        }),
    });
    const result = await fetchManagerList();
    expect(result.custom_nodes).toHaveLength(1);
    expect(result.custom_nodes![0].title).toBe('Test Pack');
  });

  it('throws on non-ok response', async () => {
    const fetch = (await import('node-fetch')).default as ReturnType<typeof vi.fn>;
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchManagerList()).rejects.toThrow(/Manager list failed/);
  });
});
