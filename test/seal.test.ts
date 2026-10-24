import { describe, expect, it } from 'vitest';
import { SealSession, sealTextRegion } from '../src/shared/seal';
import type { PriceMap } from '../src/shared/types';

const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 1, bucket: 'x', fetchedAt: 0 });
const PRICES: PriceMap = { 5140: p(0.0743), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };

describe('sealTextRegion', () => {
  it('cobre o texto da Flame medido no print real (área útil 1919x1079)', () => {
    const r = sealTextRegion({ x: 0, y: 0, width: 1919, height: 1079 });
    // texto real: x 768..1152, y 645..695
    expect(r.x).toBeLessThan(768);
    expect(r.x + r.width).toBeGreaterThan(1152);
    expect(r.y).toBeLessThan(645);
    expect(r.y + r.height).toBeGreaterThan(695);
    expect(r.y + r.height).toBeLessThan(760); // antes do botão Confirm
  });
});

describe('SealSession', () => {
  it('ranqueia as Flames vistas e marca a atual', () => {
    const s = new SealSession();
    s.add('After defeating Pirates, a Whisper of Armament of Rare quality or higher is guaranteed to appear among the selectable Seal Whispers', 'legendary', PRICES);
    s.add('After defeating Void Pirates, a Whisper of Wealth of Magic quality or higher is guaranteed to appear', 'rare', PRICES);
    expect(s.size).toBe(2);
    expect(s.current).toBe('Wealth Magic+ garantido');
    expect(s.ranked()[0].label).toBe('Wealth Magic+ garantido');
    expect(s.add('Put in Void Sea Flames', 'unknown', PRICES)).toBeNull();
  });
});

describe('SealSession posições', () => {
  it('uma posição só tem uma Flame (a leitura nova tira a antiga do lugar)', () => {
    const s = new SealSession();
    s.add('a Whisper of Armament of Magic quality or higher is guaranteed', 'rare', PRICES, undefined, { x: 270, y: 300, size: 60 });
    s.add('a Whisper of Wonder is guaranteed to appear', 'magic', PRICES, undefined, { x: 272, y: 302, size: 60 });
    const withPos = s.ranked().filter((f) => f.pos);
    expect(withPos).toHaveLength(1);
    expect(withPos[0].label).toBe('Wonder Normal garantido');
  });
});
