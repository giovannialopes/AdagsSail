import { describe, expect, it } from 'vitest';
import type { PriceMap } from '../src/shared/types';
import { DEFAULT_BASELINE, itemPrice, roundContext, valueAffixes } from '../src/shared/valuation';
import { parseAffixes } from '../src/shared/whisper-parser';

const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 100, bucket: 'x', fetchedAt: 0 });
const PRICES: PriceMap = {
  5140: p(0.0742857),
  5142: p(0.0076),
  5143: p(0.026),
  5144: p(0.9),
  410201: p(18),
  410202: p(32.65),
  410203: p(6),
};

const value = (text: string, prices = PRICES) => valueAffixes(parseAffixes(text).affixes, prices);

describe('itemPrice', () => {
  it('mixes thread and invitation prices by baseline weights', () => {
    const b = DEFAULT_BASELINE;
    expect(itemPrice('scrap', PRICES, b)).toBeCloseTo(0.0742857);
    const thread = b.threadMix.magic * 0.0076 + b.threadMix.rare * 0.026 + b.threadMix.epic * 0.9;
    expect(itemPrice('thread', PRICES, b)).toBeCloseTo(thread);
    expect(itemPrice('hero', PRICES, b)).toBe(b.heroMemoryFE);
    expect(itemPrice('scrap', {}, b)).toBeNull();
  });
});

describe('valueAffixes', () => {
  it('flat scraps are exact (not estimated)', () => {
    const v = value('Void Sea Treasures drop 39 additional Memory Scrap(s)');
    expect(v.totalFE).toBeCloseTo(39 * 0.0742857, 4);
    expect(v.parts.scrap).toBeCloseTo(v.totalFE);
    expect(v.estimated).toBe(false);
  });

  it('chance for N scraps uses expected value', () => {
    const v = value('20 % chance for 194 additional Memory Scrap(s) to drop from Void Sea Treasures');
    expect(v.totalFE).toBeCloseTo(0.2 * 194 * 0.0742857, 4);
  });

  it('percent affixes depend on the baseline and are flagged estimated', () => {
    const b = DEFAULT_BASELINE;
    const v = value('+ 140 % additional Memory Scrap Drop Quantity in base Void Sea Treasure drops');
    expect(v.totalFE).toBeCloseTo(b.scrapChance * b.scrapQty * 1.4 * 0.0742857, 4);
    expect(v.estimated).toBe(true);
  });

  it('invitations are valued with the invitation mix', () => {
    const v = value('Void Sea Treasures drop 2 additional Void Sea Invitation(s)');
    expect(v.parts.invitation).toBeCloseTo(2 * itemPrice('invitation', PRICES, DEFAULT_BASELINE)!);
  });

  it('flags missing prices instead of inventing a value', () => {
    const v = value('Void Sea Treasures drop 39 additional Memory Scrap(s)', {});
    expect(v.totalFE).toBe(0);
    expect(v.missingPrices).toBe(true);
  });

  it('parts add up to the total', () => {
    const v = value(
      [
        '+36 % Void Sea Treasure Base Drop Quantity',
        '+196 % Void Sea Treasure Drop Rarity',
        '+84 % chance for Memory Scraps dropped from Void Sea Treasures to be multiplied by 3 time(s)',
        '2 additional Hero Memory(ies) drop from Void Sea Treasures',
      ].join('\n'),
    );
    const sum = Object.values(v.parts).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(v.totalFE, 8);
    expect(v.totalFE).toBeGreaterThan(0);
  });
});

describe('rodada (cartas já escolhidas)', () => {
  const aff = (t: string) => parseAffixes(t).affixes;
  const MULT = '+84 % chance for Memory Scraps dropped from Void Sea Treasures to be multiplied by 3 time(s)';
  const FLAT = 'Void Sea Treasures drop 39 additional Memory Scrap(s)';

  it('×3 vale mais quando a rodada já tem Scraps garantidos', () => {
    const alone = valueAffixes(aff(MULT), PRICES).totalFE;
    const withFlats = valueAffixes(aff(MULT), PRICES, DEFAULT_BASELINE, roundContext([aff(FLAT), aff(FLAT)])).totalFE;
    expect(withFlats - alone).toBeCloseTo(0.84 * 2 * 78 * 0.0742857, 3);
  });

  it('Scraps novos valem mais quando a rodada já tem ×3', () => {
    const alone = valueAffixes(aff(FLAT), PRICES).totalFE;
    const withMult = valueAffixes(aff(FLAT), PRICES, DEFAULT_BASELINE, roundContext([aff(MULT)])).totalFE;
    expect(withMult).toBeCloseTo(alone * (1 + 0.84 * 2), 4);
  });
});

describe('garantido × chance', () => {
  const aff = (t: string) => parseAffixes(t).affixes;
  it('flat é garantido; Boss é chance com jackpot de 1 Invitation', () => {
    const flat = valueAffixes(aff('Void Sea Treasures drop 15 additional Memory Scrap(s)'), PRICES);
    expect(flat.guaranteedFE).toBeCloseTo(flat.totalFE);
    expect(flat.chanceFE).toBe(0);
    const boss = valueAffixes(aff('40% chance for 1 additional Void Sea Invitation(s) to drop from Void Sea Treasures'), PRICES);
    expect(boss.guaranteedFE).toBe(0);
    expect(boss.chanceFE).toBeCloseTo(0.4 * 18);
    expect(boss.jackpotFE).toBeCloseTo(18);
  });
});

describe('Drop Rarity (Hero Memories, não Threads)', () => {
  const aff = (t: string) => parseAffixes(t).affixes;
  const RARITY = '+49% Void Sea Treasure Drop Rarity';
  const ARM = '+32% additional Hero Memory Drop Quantity in base Void Sea Treasure drops';
  it('não vale 0: melhora as Hero Memories do baú', () => {
    const v = valueAffixes(aff(RARITY), PRICES);
    expect(v.parts.hero).toBeGreaterThan(0);
    expect(v.parts.thread).toBe(0);
  });
  it('Armament vale mais com Drop Rarity na rodada (e vice-versa)', () => {
    const alone = valueAffixes(aff(ARM), PRICES).totalFE;
    const withRarity = valueAffixes(aff(ARM), PRICES, DEFAULT_BASELINE, roundContext([aff(RARITY)])).totalFE;
    expect(withRarity).toBeCloseTo(alone * 1.49, 5);
    const r0 = valueAffixes(aff(RARITY), PRICES).totalFE;
    const rWith = valueAffixes(aff(RARITY), PRICES, DEFAULT_BASELINE, roundContext([aff('8 additional Hero Memory(ies) drop from Void Sea Treasures')])).totalFE;
    expect(rWith).toBeGreaterThan(r0);
  });
});
