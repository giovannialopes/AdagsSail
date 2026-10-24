import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flameValue, parseFlame } from '../src/shared/flames';
import type { PriceMap } from '../src/shared/types';
import { expectedCardFE } from '../src/shared/whisper-pool';

const all: { rarity: string; text: string }[] = JSON.parse(readFileSync(new URL('./fixtures/tlidb-flames-ss14.json', import.meta.url), 'utf8'));
const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 1, bucket: 'x', fetchedAt: 0 });
const PRICES: PriceMap = { 5140: p(0.0743), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };

describe('parseFlame (54 textos SS14 do tlidb)', () => {
  it('reconhece todas as Flames', () => {
    const missed = all.filter((f) => !parseFlame(f.text)).map((f) => f.text);
    expect(missed).toEqual([]);
  });

  it('lê o texto real da tela (print do usuário)', () => {
    expect(parseFlame('After defeating Pirates, a Whisper of Armament of Rare quality or higher is guaranteed to appear among the selectable Seal Whispers')).toEqual(
      expect.objectContaining({ kind: 'guarantee', whisper: 'armament', minQuality: 'rare' }),
    );
    expect(parseFlame('After defeating Void Pirates, a Whisper of Wealth of\nMagic quality or higher is guaranteed to appear among the')).toEqual(
      expect.objectContaining({ kind: 'guarantee', whisper: 'wealth', minQuality: 'magic' }),
    );
    expect(parseFlame('After defeating Void Pirates, all Seal Whispers become Legendary quality')).toEqual(expect.objectContaining({ kind: 'allQuality', minQuality: 'legendary' }));
    expect(parseFlame('Whispers of Wonder become Rare quality or higher')).toEqual(expect.objectContaining({ kind: 'typeQuality', whisper: 'wonder' }));
  });
});

describe('valores', () => {
  it('cartas melhores valem mais e Armament vale menos que Wealth', () => {
    expect(expectedCardFE('wealth', 'legendary', PRICES)).toBeGreaterThan(expectedCardFE('wealth', 'normal', PRICES));
    expect(expectedCardFE('wealth', 'rare', PRICES)).toBeGreaterThan(expectedCardFE('armament', 'rare', PRICES));
  });

  it('ranking de Flames: todas Legendary > Wealth Rare+ > Armament Rare+', () => {
    const v = (t: string) => flameValue(parseFlame(t)!, PRICES);
    const allLeg = v('all Seal Whispers become Legendary quality');
    const wealthRare = v('a Whisper of Wealth of Rare quality or higher is guaranteed');
    const armRare = v('a Whisper of Armament of Rare quality or higher is guaranteed');
    expect(allLeg).toBeGreaterThan(wealthRare);
    expect(v('a Boss Whisper of Rare quality or higher is guaranteed')).toBeGreaterThan(wealthRare);
    expect(wealthRare).toBeGreaterThan(armRare);
  });
});

describe('Flames por objetivo', () => {
  const v = (t: string, g: 'hero' | 'scrap' | 'invitation') => flameValue(parseFlame(t)!, PRICES, undefined, g);
  const ARM = 'a Whisper of Armament of Rare quality or higher is guaranteed';
  const WEA = 'a Whisper of Wealth of Rare quality or higher is guaranteed';
  const BOSS = 'a Boss Whisper of Rare quality or higher is guaranteed';
  it('Hero Memory prefere Armament; Scrap prefere Wealth; Invitation prefere Boss', () => {
    expect(v(ARM, 'hero')).toBeGreaterThan(v(WEA, 'hero'));
    expect(v(WEA, 'scrap')).toBeGreaterThan(v(ARM, 'scrap'));
    expect(v(BOSS, 'invitation')).toBeGreaterThan(v(WEA, 'invitation'));
  });
});
