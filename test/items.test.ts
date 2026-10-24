import { describe, expect, it } from 'vitest';
import { ITEMS, PRICE_IDS, itemKey } from '../src/shared/items';

describe('items', () => {
  it('maps Blacksail item ids', () => {
    expect(ITEMS[5140].key).toBe('scrap');
    expect(ITEMS[5144].key).toBe('threadEpic');
    expect(ITEMS[410202].key).toBe('invEcstasy');
    expect(itemKey(71002)).toBe('heroMemory');
    expect(itemKey(100300)).toBe('fe');
    expect(itemKey(200028)).toBe('ember');
    expect(itemKey(6004)).toBe('fluorescent');
    expect(itemKey(100200)).toBeNull(); // Flame Sand: valor desprezível
  });

  it('price ids are the 7 tradeable items, without Hero Memory', () => {
    expect(PRICE_IDS).toHaveLength(7);
    expect(PRICE_IDS).not.toContain(71001);
    expect(PRICE_IDS).toContain(5140);
  });
});
