import { describe, expect, it } from 'vitest';
import type { CardRead } from '../src/shared/layout';
import { Round } from '../src/shared/round';
import { evaluateCard } from '../src/shared/session';
import type { PriceMap } from '../src/shared/types';

const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 1, bucket: 'x', fetchedAt: 0 });
const PRICES: PriceMap = { 5140: p(0.0743), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };
const box = { x0: 0, y0: 0, x1: 1, y1: 1 };
const card = (quality: CardRead['quality'], line: string, slot: number) =>
  evaluateCard({ type: 'wealth', title: 'Whisper of Wealth', titleBox: box, bbox: box, lines: [line], conf: 90, quality, slot }, PRICES);

describe('Round', () => {
  const shown = [
    card('magic', 'Void Sea Treasures drop 15 additional Memory Scrap(s)', 0),
    card('magic', '+53% chance for Memory Threads to appear among base Void Sea Treasure drops', 1),
    card('normal', '+14% chance for Memory Scraps to appear among base Void Sea Treasure drops', 2),
  ];

  it('identifica a carta pela raridade do log', () => {
    const r = new Round();
    const res = r.pick(1, shown); // Rarity1 = Normal
    expect(res.card?.slot).toBe(2);
    expect(res.ambiguous).toBe(false);
  });

  it('duas da mesma raridade: marca ambíguo e fica com a de maior valor', () => {
    const r = new Round();
    const res = r.pick(2, shown);
    expect(res.ambiguous).toBe(true);
    expect(res.card).not.toBeNull();
  });

  it('o contexto soma os Scraps escolhidos e a rodada recomeça no baú', () => {
    const r = new Round();
    r.pick(2, [shown[0]]);
    expect(r.context().extra.scrap).toBe(15);
    const done = r.finish();
    expect(done).toHaveLength(1);
    expect(r.picks).toHaveLength(0);
    expect(r.number).toBe(2);
  });

  it('LeftRouteTimes de volta a 6 sem baú também recomeça', () => {
    const r = new Round();
    r.pick(1, shown);
    r.syncLeft(6);
    expect(r.picks).toHaveLength(0);
  });
});
