// Assinatura barata (~1 ms) de uma região da tela: média de brilho numa grade pequena.
// Usada para (1) saber se a tela parou de mudar sem rodar OCR e (2) reconhecer um texto que já foi
// lido antes (cache) — clicar de novo numa Flame já vista não precisa de OCR.
import type { Region } from './layout';

export function regionSignature(bgra: Uint8Array | Buffer, width: number, r: Region, cols = 48, rows = 8): number[] {
  const height = bgra.length / 4 / width;
  const out: number[] = [];
  const cw = r.width / cols;
  const ch = r.height / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      let sum = 0;
      let n = 0;
      const xa = Math.max(0, Math.floor(r.x + gx * cw));
      const xb = Math.min(width, Math.floor(r.x + (gx + 1) * cw));
      const ya = Math.max(0, Math.floor(r.y + gy * ch));
      const yb = Math.min(height, Math.floor(r.y + (gy + 1) * ch));
      for (let y = ya; y < yb; y += 2) {
        for (let x = xa; x < xb; x += 2) {
          const i = (y * width + x) * 4;
          sum += 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
          n++;
        }
      }
      out.push(n ? sum / n : 0);
    }
  }
  return out;
}

// Diferença média por célula (0..255). Mesma tela parada ≈ 0–2; texto diferente ≫ 6.
export function signatureDiff(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

export const SAME_TEXT = 3;
