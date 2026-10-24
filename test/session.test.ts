import { describe, expect, it } from 'vitest';
import type { CardRead } from '../src/shared/layout';
import { ChoiceSession, evaluateCard } from '../src/shared/session';
import type { PriceMap } from '../src/shared/types';

const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 100, bucket: 'x', fetchedAt: 0 });
const PRICES: PriceMap = { 5140: p(0.0742857), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };
const box = { x0: 0, y0: 0, x1: 10, y1: 10 };

const card = (type: CardRead['type'], lines: string[], conf = 90): CardRead => ({
  type,
  title: type,
  titleBox: box,
  bbox: box,
  lines,
  conf,
  quality: 'rare',
});

describe('evaluateCard', () => {
  it('parses and values a card read', () => {
    const e = evaluateCard(card('wealth', ['Void Sea Treasures drop 39 additional', 'Memory Scrap(s)']), PRICES);
    expect(e.affixes).toHaveLength(1);
    expect(e.value.totalFE).toBeCloseTo(39 * 0.0742857, 4);
    expect(e.lowConfidence).toBe(false);
  });
});

describe('ChoiceSession', () => {
  it('ranks cards by FE and marks the best', () => {
    const s = new ChoiceSession();
    s.add([
      card('wealth', ['Void Sea Treasures drop 39 additional Memory Scrap(s)']),
      card('boss', ['Void Sea Treasures drop 2 additional Void Sea Invitation(s)']),
      card('armament', ['2 additional Hero Memory(ies) drop from Void Sea Treasures']),
    ], PRICES);
    const ranked = s.ranked();
    expect(ranked.map((c) => c.type)).toEqual(['boss', 'wealth', 'armament']);
    expect(s.bestKey()).toBe(ranked[0].key);
  });

  it('merges repeated reads of the same card keeping the more complete one', () => {
    const s = new ChoiceSession();
    s.add([card('wealth', ['Void Sea Treasures drop 39 additional Memory Scrap(s)'])], PRICES);
    s.add([
      card('wealth', [
        'Void Sea Treasures drop 39 additional Memory Scrap(s)',
        '20 % chance for 194 additional Memory Scrap(s) to drop from Void Sea Treasures',
      ]),
    ], PRICES);
    expect(s.ranked()).toHaveLength(1);
    expect(s.ranked()[0].affixes).toHaveLength(2);
  });

  it('does not crown a low-confidence card when the margin is small', () => {
    const s = new ChoiceSession();
    s.add([
      card('wealth', ['Void Sea Treasures drop 40 additional Memory Scrap(s)'], 40),
      card('wealth', ['Void Sea Treasures drop 39 additional Memory Scrap(s)'], 95),
    ], PRICES);
    expect(s.bestKey()).toBeNull();
  });

  it('cards with no recognized affix are kept but never best', () => {
    const s = new ChoiceSession();
    s.add([card('boss', ['+15% Movement Speed'])], PRICES);
    expect(s.ranked()[0].unknown).toEqual(['+15% Movement Speed']);
    expect(s.bestKey()).toBeNull();
  });
});

describe('ChoiceSession com posições fixas (tela SS14)', () => {
  const slotCard = (slot: number, lines: string[], conf = 90): CardRead => ({ ...card('wealth', lines, conf), slot });

  it('keeps the clean read of a slot over a later noisy one', () => {
    const s = new ChoiceSession();
    s.add([slotCard(2, ['+ 14% chance for Memory Scraps to appear among base Void Sea Treasure drops'])], PRICES);
    s.add([slotCard(2, ['NY \ 14 chance for Memory Scraps to appear among base Void Sea Treasure drops'])], PRICES);
    const [only] = s.ranked();
    expect(s.size).toBe(1);
    expect(only.affixes).toHaveLength(1);
  });

  it('a noisy first read is upgraded and a Switch replaces the slot', () => {
    const s = new ChoiceSession();
    s.add([slotCard(0, ['14 chance for Memory Scraps to appear'])], PRICES);
    s.add([slotCard(0, ['Void Sea Treasures drop 15 additional Memory Scrap(s)'])], PRICES);
    expect(s.ranked()[0].affixes[0]).toMatchObject({ kind: 'flat', n: 15 });
    s.add([slotCard(0, ['Void Sea Treasures drop 2 additional Void Sea Invitation(s)'])], PRICES);
    expect(s.size).toBe(1);
    expect(s.ranked()[0].affixes[0]).toMatchObject({ item: 'invitation' });
  });
});

describe('ChoiceSession por objetivo', () => {
  const cards = () => [
    card('wealth', ['Void Sea Treasures drop 29 additional Memory Scrap(s)']),
    card('armament', ['6 additional Hero Memory(ies) drop from Void Sea Treasures']),
    card('boss', ['40% chance for 1 additional Void Sea Invitation(s) to drop from Void Sea Treasures']),
  ];
  it('cada objetivo escolhe a sua carta', () => {
    for (const [goal, type] of [['fe', 'boss'], ['scrap', 'wealth'], ['hero', 'armament'], ['invitation', 'boss']] as const) {
      const s = new ChoiceSession(goal);
      s.add(cards(), PRICES);
      expect(s.ranked()[0].type).toBe(type);
    }
  });
  it('sem carta para o objetivo, cai para FE', () => {
    const s = new ChoiceSession('thread');
    s.add(cards(), PRICES);
    expect(s.effectiveGoal()).toBe('fe');
    expect(s.ranked()[0].type).toBe('boss');
  });
});
