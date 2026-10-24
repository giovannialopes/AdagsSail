// Acha, na tela "Void Sea Seal", onde está a Flame SELECIONADA. Duas etapas:
//  1) ícones das Flames = manchas claras e coloridas ao redor do selo;
//  2) o selecionado é o único com contorno claro em volta (borda branca/lilás fina e o rastro que vai
//     até o centro): o ícone com mais pixels de "borda" no anel ao redor.
// A cada clique o app grava "texto lido → posição", e assim consegue circular a melhor Flame. BGRA.
import type { Region } from './layout';

export interface SelectedSlot {
  x: number; // centro do ícone, em pixels do frame
  y: number;
  size: number; // lado aproximado do ícone
}

const CELL = 6;

// Zonas que não são Flames: ícone central, título, texto da descrição, botão Confirm.
function excluded(px: number, py: number, H: number): boolean {
  if (Math.hypot(px, py) < 0.17 * H) return true;
  if (Math.abs(px) < 0.2 * H && py < -0.12 * H) return true; // "Put in Void Sea Flames"
  if (Math.abs(px) < 0.24 * H && py > 0.05 * H) return true; // descrição + Confirm
  return false;
}

interface Blob {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
  n: number;
}

function components(grid: Uint8Array, gw: number, gh: number): Blob[] {
  const seen = new Uint8Array(gw * gh);
  const out: Blob[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const b: Blob = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, n: 0 };
    while (stack.length) {
      const k = stack.pop()!;
      const gx = k % gw;
      const gy = (k - gx) / gw;
      b.n++;
      b.minx = Math.min(b.minx, gx);
      b.maxx = Math.max(b.maxx, gx);
      b.miny = Math.min(b.miny, gy);
      b.maxy = Math.max(b.maxy, gy);
      for (const [nx, ny] of [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const nk = ny * gw + nx;
        if (grid[nk] && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    out.push(b);
  }
  return out;
}

export function findSelectedFlame(bgra: Uint8Array | Buffer, width: number, client: Region): SelectedSlot | null {
  const H = client.height;
  const cx = client.x + client.width / 2;
  const cy = client.y + client.height / 2;
  const height = bgra.length / 4 / width;
  const x0 = Math.max(0, Math.floor(cx - 0.45 * H));
  const x1 = Math.min(width, Math.ceil(cx + 0.45 * H));
  const y0 = Math.max(0, Math.floor(cy - 0.42 * H));
  const y1 = Math.min(height, Math.ceil(cy + 0.42 * H));
  const gw = Math.ceil((x1 - x0) / CELL);
  const gh = Math.ceil((y1 - y0) / CELL);
  const rgb = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [bgra[i + 2], bgra[i + 1], bgra[i]] as const;
  };

  // 1) células de ícone: vários pixels muito claros e coloridos (ou branco quente da Flame Normal)
  const grid = new Uint8Array(gw * gh);
  const colorful = new Uint16Array(gw * gh); // pixels coloridos (não brancos) por célula
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (excluded(x0 + gx * CELL + CELL / 2 - cx, y0 + gy * CELL + CELL / 2 - cy, H)) continue;
      let bright = 0;
      for (let y = y0 + gy * CELL; y < Math.min(y1, y0 + (gy + 1) * CELL); y++) {
        for (let x = x0 + gx * CELL; x < Math.min(x1, x0 + (gx + 1) * CELL); x++) {
          const [r, g, b] = rgb(x, y);
          const max = Math.max(r, g, b);
          if (max > 205 && (max - Math.min(r, g, b) > 60 || Math.min(r, g, b) > 200)) bright++;
          if (max > 205 && max - Math.min(r, g, b) > 60) colorful[gy * gw + gx]++;
        }
      }
      if (bright >= 4) grid[gy * gw + gx] = 1;
    }
  }

  // 2) para cada ícone, conta pixels de borda clara (cinza/lilás claro) no anel em volta
  type Cand = SelectedSlot & { border: number; colorful: number };
  const cands: Cand[] = [];
  let best: Cand | null = null;
  for (const b of components(grid, gw, gh)) {
    const side = Math.max(b.maxx - b.minx + 1, b.maxy - b.miny + 1) * CELL;
    if (side < 0.025 * H || side > 0.1 * H || b.n < 6) continue;
    const x = x0 + ((b.minx + b.maxx + 1) / 2) * CELL;
    const y = y0 + ((b.miny + b.maxy + 1) / 2) * CELL;
    const inner = side * 0.8;
    const outer = Math.max(side * 2.2, 0.09 * H);
    let border = 0;
    for (let yy = Math.max(0, Math.floor(y - outer)); yy < Math.min(height, y + outer); yy += 2) {
      for (let xx = Math.max(0, Math.floor(x - outer)); xx < Math.min(width, x + outer); xx += 2) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) < inner) continue;
        if (excluded(xx - cx, yy - cy, H)) continue;
        const [r, g, bb] = rgb(xx, yy);
        const max = Math.max(r, g, bb);
        const lumV = 0.299 * r + 0.587 * g + 0.114 * bb;
        if (max > 150 && lumV < 235 && (max - Math.min(r, g, bb)) / max < 0.3) border++;
      }
    }
    let col = 0;
    for (let gy = b.miny; gy <= b.maxy; gy++) for (let gx = b.minx; gx <= b.maxx; gx++) if (grid[gy * gw + gx]) col += colorful[gy * gw + gx];
    const cand = { x, y, size: side, border, colorful: col };
    cands.push(cand);
    if (!best || border > best.border) best = cand;
  }
  // O canto branco do contorno também é claro: se perto do escolhido houver uma mancha bem mais
  // colorida, ela é o ícone de verdade.
  if (best) {
    const near = cands.filter((c) => c !== best && Math.hypot(c.x - best!.x, c.y - best!.y) < Math.max(best!.size, c.size) * 2.2);
    const icon = near.sort((a, b) => b.colorful - a.colorful)[0];
    if (icon && icon.colorful > best.colorful * 1.5) best = { ...icon, border: best.border };
  }
  return best && best.border >= 12 ? { x: best.x, y: best.y, size: best.size } : null;
}
