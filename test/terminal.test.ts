import { describe, expect, it } from 'vitest';
import { readSlot, terminalRegions } from '../src/shared/terminal';

describe('terminalRegions', () => {
  it('matches the measured 1920x1080 layout (janela com barra de título de 31px)', () => {
    const [a, b, c] = terminalRegions({ x: 1, y: 31, width: 1920, height: 1080 });
    // centros medidos dos títulos no frame: 614.5, 960.5, 1321
    for (const [r, cx] of [[a, 614.5], [b, 960.5], [c, 1321]] as const) {
      expect(Math.abs(r.x + r.width / 2 - cx)).toBeLessThan(6);
      expect(r.y).toBeLessThan(661); // topo do título
      expect(r.y + r.height).toBeGreaterThan(751); // fim da 2ª linha do afixo
      expect(r.y + r.height).toBeLessThan(783); // antes do botão de check
    }
  });

  it('scales with height and stays centered on ultrawide', () => {
    const [a, , c] = terminalRegions({ x: 0, y: 0, width: 3440, height: 1440 });
    expect(Math.round(a.x + a.width / 2)).toBe(Math.round(1720 - 0.3208 * 1440));
    expect(Math.round(c.x + c.width / 2)).toBe(Math.round(1720 + 0.3333 * 1440));
  });
});

describe('readSlot', () => {
  const l = (text: string, y0: number) => ({ text, conf: 90, bbox: { x0: 500, y0, x1: 740, y1: y0 + 16 } });
  it('takes the title line and the lines below it', () => {
    const card = readSlot([l('Memory Scrap(s)', 706), l('|| Whisper of Wealth', 631), l('Void Sea Treasures drop 15 additional', 686)], 0)!;
    expect(card.type).toBe('wealth');
    expect(card.slot).toBe(0);
    expect(card.lines).toEqual(['Void Sea Treasures drop 15 additional', 'Memory Scrap(s)']);
  });
  it('returns null without a title', () => {
    expect(readSlot([l('Select a Seal Whisper', 860)], 1)).toBeNull();
  });
});
