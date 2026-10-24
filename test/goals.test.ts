import { describe, expect, it } from 'vitest';
import { goalScore } from '../src/shared/goals';
import { DEFAULT_BASELINE as B, roundContext } from '../src/shared/valuation';
import { parseAffixes } from '../src/shared/whisper-parser';

const aff = (t: string) => parseAffixes(t).affixes;
const FLAT = 'Void Sea Treasures drop 29 additional Memory Scrap(s)';
const MULT = '+64% chance for Memory Scraps dropped from Void Sea Treasures to be multiplied by 2 time(s)';
const RARITY = '+49% Void Sea Treasure Drop Rarity';
const HERO8 = '8 additional Hero Memory(ies) drop from Void Sea Treasures';

describe('goalScore', () => {
  it('Scrap: flat soma unidades; ×2 multiplica o baú base + o que já foi escolhido', () => {
    expect(goalScore(aff(FLAT), 'scrap')).toBeCloseTo(29);
    const baseScrap = B.scrapChance * B.scrapQty;
    expect(goalScore(aff(MULT), 'scrap')).toBeCloseTo(0.64 * baseScrap);
    expect(goalScore(aff(MULT), 'scrap', B, roundContext([aff(FLAT)]))).toBeCloseTo(0.64 * (baseScrap + 29));
  });

  it('Hero vermelha: raridade vale mais quando a rodada já tem muitas Hero Memories', () => {
    const alone = goalScore(aff(RARITY), 'hero');
    const withMany = goalScore(aff(RARITY), 'hero', B, roundContext([aff(HERO8)]));
    expect(withMany).toBeGreaterThan(alone * 5);
    // e quantidade vale mais quando já tem raridade
    expect(goalScore(aff(HERO8), 'hero', B, roundContext([aff(RARITY)]))).toBeCloseTo(8 * 1.49);
  });

  it('cartas de outro objetivo valem 0', () => {
    expect(goalScore(aff(FLAT), 'hero')).toBe(0);
    expect(goalScore(aff('40% chance for 1 additional Void Sea Invitation(s) to drop from Void Sea Treasures'), 'scrap')).toBe(0);
    expect(goalScore(aff('40% chance for 1 additional Void Sea Invitation(s) to drop from Void Sea Treasures'), 'invitation')).toBeCloseTo(0.4);
  });
});
