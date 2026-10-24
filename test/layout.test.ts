import { describe, expect, it } from 'vitest';
import { cardRegions, classifyQuality, groupCards, type OcrLine } from '../src/shared/layout';

const line = (text: string, x0: number, y0: number, w = 300, h = 24, conf = 90): OcrLine => ({
  text,
  conf,
  bbox: { x0, y0, x1: x0 + w, y1: y0 + h },
});

describe('groupCards', () => {
  it('splits three side-by-side cards into columns', () => {
    const lines = [
      line('Whisper of Wealth', 400, 300, 200),
      line('Whisper of Wonder', 860, 300, 200),
      line('Boss Whisper', 1320, 300, 160),
      line('Void Sea Treasures drop 39 additional', 360, 360),
      line('Memory Scrap(s)', 360, 390),
      line('+98 % Void Sea Treasure Drop Rarity', 820, 360),
      line('Void Sea Treasures drop 2 additional Void Sea Invitation(s)', 1280, 360),
      line('Please select a Seal Whisper', 800, 900, 320),
    ];
    const cards = groupCards(lines, 1920);
    expect(cards.map((c) => c.type)).toEqual(['wealth', 'wonder', 'boss']);
    expect(cards[0].lines).toEqual(['Void Sea Treasures drop 39 additional', 'Memory Scrap(s)']);
    expect(cards[1].lines).toEqual(['+98 % Void Sea Treasure Drop Rarity']);
    expect(cards[2].lines).toEqual(['Void Sea Treasures drop 2 additional Void Sea Invitation(s)']);
  });

  it('a single detail panel becomes one card', () => {
    const cards = groupCards(
      [line('Whisper of Armament', 1400, 200, 220), line('2 additional Hero Memory(ies) drop from Void Sea Treasures', 1380, 240, 400)],
      1920,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].lines).toHaveLength(1);
  });

  it('ignores Void Sea Flame descriptions that mention a Whisper mid-sentence (tela real SS14)', () => {
    const cards = groupCards(
      [
        line('After defeating Pirates, a Whisper of Armament of', 777, 676, 368, 15),
        line('Rare quality or higher is guaranteed to appear among the', 770, 694, 382, 15),
      ],
      1922,
    );
    expect(cards).toEqual([]);
  });

  it('ignores text above the titles and returns nothing without titles', () => {
    expect(groupCards([line('Void Sea Terminal', 100, 50)], 1920)).toEqual([]);
  });
});

describe('classifyQuality', () => {
  const W = 10;
  const H = 10;
  const solid = (r: number, g: number, b: number) => {
    const px = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) px.set([r, g, b, 255], i * 4);
    return px;
  };
  const box = { x0: 0, y0: 0, x1: W, y1: H };

  it('maps hues to rarities', () => {
    expect(classifyQuality(solid(80, 150, 240), W, box)).toBe('magic');
    expect(classifyQuality(solid(170, 40, 220), W, box)).toBe('rare');
    expect(classifyQuality(solid(245, 190, 50), W, box)).toBe('legendary');
    expect(classifyQuality(solid(220, 220, 220), W, box)).toBe('normal');
  });

  it('supports BGRA bitmaps', () => {
    expect(classifyQuality(solid(240, 150, 80), W, box, true)).toBe('magic');
  });
});

describe('cardRegions', () => {
  it('splits neighbouring cards at the midpoint and extends below the title', () => {
    const t = (x0: number) => ({ titleBox: { x0, y0: 300, x1: x0 + 200, y1: 326 }, bbox: { x0: x0 - 40, y0: 300, x1: x0 + 240, y1: 420 } });
    const [a, b, c] = cardRegions([t(400), t(860), t(1320)], 1920, 1080);
    expect(a.x + a.width).toBeLessThanOrEqual(730);
    expect(b.x).toBeGreaterThanOrEqual(730);
    expect(b.x + b.width).toBeLessThanOrEqual(1190);
    expect(c.x).toBeGreaterThanOrEqual(1190);
    expect(a.y).toBeLessThan(300);
    expect(a.y + a.height).toBeGreaterThan(420);
    expect(a.y + a.height).toBeLessThanOrEqual(1080);
  });

  it('a lone card gets a generous width', () => {
    const [r] = cardRegions([{ titleBox: { x0: 1400, y0: 200, x1: 1620, y1: 226 }, bbox: { x0: 1380, y0: 200, x1: 1780, y1: 260 } }], 1920, 1080);
    expect(r.width).toBeGreaterThan(400);
    expect(r.x + r.width).toBeLessThanOrEqual(1920);
  });
});
