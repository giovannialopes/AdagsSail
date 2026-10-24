import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PriceService } from '../src/main/prices';

const html = readFileSync(new URL('./fixtures/titrack-5140.html', import.meta.url), 'utf8');

describe('PriceService', () => {
  it('fetches, caches and keeps the last good price when the site fails', async () => {
    const cache = join(mkdtempSync(join(tmpdir(), 'adags-')), 'prices-cache.json');
    let up = true;
    const fetchFn = async (url: string) => {
      expect(url).toBe('https://titrack.ninja/item/5140?season=1601');
      return { ok: up, status: up ? 200 : 503, text: async () => html };
    };
    const svc = new PriceService(cache, fetchFn, [5140]);
    await svc.refresh();
    expect(svc.get()[5140].fe).toBeCloseTo(0.0742857);
    expect(svc.lastError).toBeNull();

    up = false;
    await svc.refresh();
    expect(svc.lastError).toContain('503');
    expect(svc.get()[5140].fe).toBeCloseTo(0.0742857);

    const reloaded = new PriceService(cache, fetchFn, [5140]);
    expect(reloaded.get()[5140].devices).toBe(391);
  });
});
