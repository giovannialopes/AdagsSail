import { describe, expect, it } from 'vitest';
import { regionSignature, SAME_TEXT, signatureDiff } from '../src/shared/signature';

function image(w: number, h: number, paint: (x: number, y: number) => number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([paint(x, y), paint(x, y), paint(x, y), 255], (y * w + x) * 4);
  return px;
}

describe('regionSignature', () => {
  const r = { x: 0, y: 0, width: 200, height: 40 };
  const textA = image(200, 40, (x, y) => ((x % 17 < 3 && y > 10 && y < 30) ? 230 : 20));
  const textB = image(200, 40, (x, y) => ((x % 11 < 4 && y > 8 && y < 32) ? 230 : 20));
  it('mesma imagem = mesma assinatura; texto diferente = diferente', () => {
    expect(signatureDiff(regionSignature(textA, 200, r), regionSignature(textA, 200, r))).toBe(0);
    expect(signatureDiff(regionSignature(textA, 200, r), regionSignature(textB, 200, r))).toBeGreaterThan(SAME_TEXT);
  });
});
