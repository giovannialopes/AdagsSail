import { describe, expect, it } from 'vitest';
import { sealTextRegion } from '../src/shared/seal';
import { terminalRegions } from '../src/shared/terminal';
import { ANCHORS, uiUnit, unitFromAnchor } from '../src/shared/uiscale';

describe('uiUnit (escala da interface por proporção da janela)', () => {
  it('16:9 e ultrawide usam a altura; janela mais alta usa a largura', () => {
    expect(uiUnit({ x: 0, y: 0, width: 1920, height: 1080 })).toBe(1080);
    expect(uiUnit({ x: 0, y: 0, width: 3440, height: 1440 })).toBe(1440);
    expect(uiUnit({ x: 0, y: 0, width: 1920, height: 1490 })).toBe(1080); // janela do amigo (≈1,29)
    expect(uiUnit({ x: 0, y: 0, width: 1280, height: 1024 })).toBe(720);
  });

  it('janela mais alta: a interface fica centralizada com o mesmo tamanho de 1920x1080', () => {
    const ref = sealTextRegion({ x: 0, y: 0, width: 1920, height: 1080 });
    const tall = sealTextRegion({ x: 0, y: 0, width: 1920, height: 1490 });
    expect(tall.width).toBe(ref.width);
    expect(tall.height).toBe(ref.height);
    expect(tall.y - ref.y).toBe((1490 - 1080) / 2); // só desloca pelo centro
    const [a] = terminalRegions({ x: 0, y: 0, width: 1920, height: 1490 });
    const [b] = terminalRegions({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(a.y - b.y).toBe(205);
  });

  it('calibra a unidade pela âncora (Confirm)', () => {
    const client = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(unitFromAnchor(540 + 0.214 * 900, client, ANCHORS.sealConfirm)).toBeCloseTo(900);
    expect(unitFromAnchor(100, client, ANCHORS.sealConfirm)).toBeNull(); // acima do centro: inválido
  });
});
