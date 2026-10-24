// Acha, na tela "Void Sea Seal", onde está a Flame SELECIONADA:
//  1) ícones das Flames = manchas claras e coloridas ao redor do selo;
//  2) a selecionada está DENTRO de um contorno claro (losango com borda branca/lilás): o contorno a
//     cerca por vários lados. Uma vizinha só pega um pedaço desse contorno, de um lado só — por isso
//     contamos em quantos dos 8 setores em volta do ícone há borda (não o total de pixels);
//  3) desempate pela cor: o ícone grande no centro do selo é sempre o da Flame selecionada.
// A cada clique o app grava "texto lido → posição", e assim circula a melhor Flame. Bitmap BGRA.
import type { Region } from './layout';
import { uiUnit } from './uiscale';

export interface SelectedSlot {
  x: number; // centro do ícone, em pixels do frame
  y: number;
  size: number; // lado aproximado do ícone
}

export interface FlameProbe extends SelectedSlot {
  sectors: number; // setores (de 8) com contorno claro em volta
  border: number; // total de pixels de contorno
  colorDist: number; // distância de cor ao ícone central (0 = igual)
  colorful: number; // pixels coloridos (não brancos) do ícone
}

const CELL = 6;

// Zonas que não são Flames: ícone central, título, texto da descrição, botão Confirm.
function excluded(px: number, py: number, U: number): boolean {
  if (Math.hypot(px, py) < 0.17 * U) return true;
  if (Math.abs(px) < 0.2 * U && py < -0.12 * U) return true; // "Put in Void Sea Flames"
  if (Math.abs(px) < 0.24 * U && py > 0.05 * U) return true; // descrição + Confirm
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

const isIconPixel = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  return max > 205 && (max - Math.min(r, g, b) > 60 || Math.min(r, g, b) > 200);
};

// Cor média (cromaticidade) dos pixels de ícone numa caixa.
function iconChroma(bgra: Uint8Array | Buffer, width: number, height: number, x0: number, y0: number, x1: number, y1: number): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, y1); y += 2) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, x1); x += 2) {
      const i = (y * width + x) * 4;
      const R = bgra[i + 2];
      const G = bgra[i + 1];
      const B = bgra[i];
      if (!isIconPixel(R, G, B)) continue;
      const s = R + G + B || 1;
      r += R / s;
      g += G / s;
      b += B / s;
      n++;
    }
  }
  return n >= 8 ? [r / n, g / n, b / n] : null;
}

export function probeFlames(bgra: Uint8Array | Buffer, width: number, client: Region, unit: number = uiUnit(client)): FlameProbe[] {
  const U = unit;
  const cx = client.x + client.width / 2;
  const cy = client.y + client.height / 2;
  const height = bgra.length / 4 / width;
  const x0 = Math.max(0, Math.floor(cx - 0.45 * U));
  const x1 = Math.min(width, Math.ceil(cx + 0.45 * U));
  const y0 = Math.max(0, Math.floor(cy - 0.42 * U));
  const y1 = Math.min(height, Math.ceil(cy + 0.42 * U));
  const gw = Math.ceil((x1 - x0) / CELL);
  const gh = Math.ceil((y1 - y0) / CELL);
  const rgb = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [bgra[i + 2], bgra[i + 1], bgra[i]] as const;
  };

  // 1) células de ícone
  const grid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (excluded(x0 + gx * CELL + CELL / 2 - cx, y0 + gy * CELL + CELL / 2 - cy, U)) continue;
      let bright = 0;
      for (let y = y0 + gy * CELL; y < Math.min(y1, y0 + (gy + 1) * CELL); y++) {
        for (let x = x0 + gx * CELL; x < Math.min(x1, x0 + (gx + 1) * CELL); x++) {
          const [r, g, b] = rgb(x, y);
          if (isIconPixel(r, g, b)) bright++;
        }
      }
      if (bright >= 4) grid[gy * gw + gx] = 1;
    }
  }

  // cor do ícone central (= Flame selecionada)
  const ch = 0.035 * U;
  const center = iconChroma(bgra, width, height, cx - ch, cy - ch, cx + ch, cy + ch);

  // 2) para cada ícone: contorno por setor e cor
  const out: FlameProbe[] = [];
  for (const b of components(grid, gw, gh)) {
    const side = Math.max(b.maxx - b.minx + 1, b.maxy - b.miny + 1) * CELL;
    if (side < 0.025 * U || side > 0.1 * U || b.n < 6) continue;
    const x = x0 + ((b.minx + b.maxx + 1) / 2) * CELL;
    const y = y0 + ((b.miny + b.maxy + 1) / 2) * CELL;
    const inner = side * 0.8;
    const outer = Math.max(side * 2.2, 0.09 * U);
    const sectorCount = new Array(8).fill(0);
    let border = 0;
    for (let yy = Math.max(0, Math.floor(y - outer)); yy < Math.min(height, y + outer); yy += 2) {
      for (let xx = Math.max(0, Math.floor(x - outer)); xx < Math.min(width, x + outer); xx += 2) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) < inner) continue;
        if (excluded(xx - cx, yy - cy, U)) continue;
        const [r, g, bb] = rgb(xx, yy);
        const max = Math.max(r, g, bb);
        const lum = 0.299 * r + 0.587 * g + 0.114 * bb;
        if (max > 150 && lum < 235 && (max - Math.min(r, g, bb)) / max < 0.3) {
          border++;
          const a = Math.atan2(yy - y, xx - x);
          sectorCount[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8]++;
        }
      }
    }
    const chroma = iconChroma(bgra, width, height, x - side / 2, y - side / 2, x + side / 2, y + side / 2);
    let colorful = 0;
    for (let yy = Math.max(0, Math.floor(y - side / 2)); yy < Math.min(height, y + side / 2); yy += 2) {
      for (let xx = Math.max(0, Math.floor(x - side / 2)); xx < Math.min(width, x + side / 2); xx += 2) {
        const [r, g, bb] = rgb(xx, yy);
        if (Math.max(r, g, bb) > 205 && Math.max(r, g, bb) - Math.min(r, g, bb) > 60) colorful++;
      }
    }
    const colorDist = center && chroma ? Math.hypot(center[0] - chroma[0], center[1] - chroma[1], center[2] - chroma[2]) : 1;
    out.push({ x, y, size: side, sectors: sectorCount.filter((c) => c >= 3).length, border, colorDist, colorful });
  }
  return out;
}

// Ícone mais próximo de um ponto (o cursor no clique). null se nenhum ícone estiver perto.
export function flameNear(bgra: Uint8Array | Buffer, width: number, client: Region, point: { x: number; y: number }, unit: number = uiUnit(client)): SelectedSlot | null {
  let best: FlameProbe | null = null;
  let bestD = Infinity;
  for (const c of probeFlames(bgra, width, client, unit)) {
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  // o clique pode cair na borda do losango: aceita até ~1,4 lado do ícone ou 7% da unidade
  return best && bestD < Math.max(best.size * 1.4, 0.07 * unit) ? { x: best.x, y: best.y, size: best.size } : null;
}

export function findSelectedFlame(bgra: Uint8Array | Buffer, width: number, client: Region, unit: number = uiUnit(client)): SelectedSlot | null {
  // Sem clique (tela acabou de abrir): o ícone com mais borda clara em volta. Se ele for o canto branco
  // do contorno (pouca cor), um ícone bem colorido logo ao lado é o de verdade. O caminho principal é o
  // clique (flameNear) — isto é só a reserva.
  const all = probeFlames(bgra, width, client, unit);
  if (!all.length) return null;
  let best = all.reduce((a, b) => (b.border > a.border ? b : a));
  if (best.border < 12) return null;
  const near = all.filter((c) => c !== best && Math.hypot(c.x - best.x, c.y - best.y) < Math.max(best.size, c.size) * 2.2);
  const colorful = near.sort((a, b) => b.colorful - a.colorful)[0];
  if (colorful && colorful.colorful > best.colorful * 1.5) best = colorful;
  return { x: best.x, y: best.y, size: best.size };
}
