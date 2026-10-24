import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PRICE_IDS } from '../shared/items';
import { parseTitrackHtml, titrackUrl } from '../shared/titrack';
import type { PriceMap } from '../shared/types';

export const REFRESH_MS = 15 * 60_000;

type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

// Preços só do TITrack (SS14, season=1601). Mantém o último valor bom em disco caso o site caia.
// Além da lista fixa, busca sob demanda qualquer item que apareça num baú (Embers, Fluorescent...).
export class PriceService extends EventEmitter {
  private prices: PriceMap = {};
  private timer: NodeJS.Timeout | null = null;
  private readonly ids: Set<number>;
  lastError: string | null = null;

  constructor(
    private readonly cacheFile: string,
    private readonly fetchFn: Fetch = fetch as unknown as Fetch,
    ids: number[] = PRICE_IDS,
  ) {
    super();
    try {
      this.prices = JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
      this.prices = {};
    }
    // itens extras que já foram vistos antes continuam sendo atualizados
    this.ids = new Set([...ids, ...Object.keys(this.prices).map(Number)]);
  }

  get(): PriceMap {
    return this.prices;
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Item novo apareceu: entra na lista e é buscado já.
  want(id: number): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    void this.fetchOne(id).then((err) => {
      if (!err) this.save();
    });
  }

  private async fetchOne(id: number): Promise<string | null> {
    try {
      const res = await this.fetchFn(titrackUrl(id), {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'AdagsSail/1.0 (overlay pessoal)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseTitrackHtml(await res.text());
      if (!parsed) throw new Error('sem dados de preço na página');
      this.prices[id] = { ...parsed, fetchedAt: Date.now() };
      return null;
    } catch (err) {
      return `${id}: ${(err as Error).message}`;
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.cacheFile), { recursive: true });
      writeFileSync(this.cacheFile, JSON.stringify(this.prices, null, 2));
    } catch {
      // cache é opcional
    }
    this.emit('update', this.prices);
  }

  async refresh(): Promise<void> {
    const errors: string[] = [];
    for (const id of this.ids) {
      const err = await this.fetchOne(id);
      if (err) errors.push(err);
    }
    this.lastError = errors.length ? errors.join('; ') : null;
    this.save();
  }
}
