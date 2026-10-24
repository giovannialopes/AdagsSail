// Agrupa as linhas do OCR em cartas. Não depende do layout da tela: acha os títulos dos Whispers
// e junta, embaixo de cada um, as linhas contíguas da mesma coluna.
import { titleType, type WhisperType } from './whisper-parser';

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLine {
  text: string;
  conf: number;
  bbox: BBox;
}

export type Quality = 'normal' | 'magic' | 'rare' | 'legendary' | 'unknown';

export interface CardRead {
  type: WhisperType;
  title: string;
  titleBox: BBox;
  bbox: BBox;
  lines: string[];
  conf: number;
  quality: Quality;
  slot?: number; // posição fixa na tela (0..2) quando lida pelo layout da SS14
}

type Grouped = Omit<CardRead, 'quality'>;

const cx = (b: BBox) => (b.x0 + b.x1) / 2;
const h = (b: BBox) => b.y1 - b.y0;
const union = (a: BBox, b: BBox): BBox => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

export function groupCards(lines: OcrLine[], frameW: number): Grouped[] {
  const titles = lines
    .map((l) => ({ line: l, type: titleType(l.text) }))
    .filter((t) => t.type !== 'unknown')
    .sort((a, b) => a.line.bbox.x0 - b.line.bbox.x0);
  if (!titles.length) return [];

  let limit = frameW * 0.2;
  for (let i = 1; i < titles.length; i++) {
    const d = Math.abs(cx(titles[i].line.bbox) - cx(titles[i - 1].line.bbox));
    if (d > h(titles[i].line.bbox) * 2) limit = Math.min(limit, d / 2);
  }

  const cards = titles.map((t) => ({
    type: t.type,
    title: t.line.text.trim(),
    titleBox: t.line.bbox,
    bbox: t.line.bbox,
    lines: [] as string[],
    confs: [t.line.conf],
    lastY1: t.line.bbox.y1,
  }));

  const titleSet = new Set(titles.map((t) => t.line));
  const body = lines.filter((l) => !titleSet.has(l)).sort((a, b) => a.bbox.y0 - b.bbox.y0);

  for (const l of body) {
    const lh = Math.max(h(l.bbox), 8);
    let best: (typeof cards)[number] | null = null;
    for (const c of cards) {
      if (l.bbox.y0 < c.titleBox.y0 + h(c.titleBox) / 2) continue; // acima do título
      if (Math.abs(cx(l.bbox) - cx(c.titleBox)) >= limit) continue;
      if (!best || c.titleBox.y0 > best.titleBox.y0) best = c;
    }
    if (!best || l.bbox.y0 - best.lastY1 > lh * 3) continue; // não contíguo
    best.lines.push(l.text.trim());
    best.confs.push(l.conf);
    best.bbox = union(best.bbox, l.bbox);
    best.lastY1 = Math.max(best.lastY1, l.bbox.y1);
  }

  return cards.map(({ confs, lastY1: _lastY1, ...c }) => ({
    ...c,
    conf: confs.reduce((a, b) => a + b, 0) / confs.length,
  }));
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, max ? d / max : 0, max / 255];
}

// Qualidade pela cor dominante do título (convenção do jogo: branco/azul/roxo/dourado).
// `minV` sobe o corte de brilho para ícones sobre fundo colorido (só os pixels mais claros contam).
export function classifyQuality(px: Uint8Array | Buffer, width: number, box: BBox, bgra = false, minV = 0.45): Quality {
  const bins = { magic: 0, rare: 0, legendary: 0, other: 0 };
  let bright = 0;
  let total = 0;
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  const height = px.length / 4 / width;
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(height, Math.ceil(box.y1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = bgra ? px[i + 2] : px[i];
      const b = bgra ? px[i] : px[i + 2];
      const [hue, s, v] = hsv(r, px[i + 1], b);
      total++;
      if (v < minV) continue;
      if (s < 0.25) {
        bright++;
        continue;
      }
      if (hue >= 190 && hue < 252) bins.magic++;
      else if (hue >= 252 && hue < 325) bins.rare++;
      else if (hue >= 25 && hue < 62) bins.legendary++;
      else bins.other++;
    }
  }
  if (!total) return 'unknown';
  const colored = bins.magic + bins.rare + bins.legendary + bins.other;
  if (colored < total * 0.04) return bright > total * 0.04 ? 'normal' : 'unknown';
  const [winner] = (Object.entries(bins) as [keyof typeof bins, number][]).sort((a, b) => b[1] - a[1])[0];
  return winner === 'other' ? 'unknown' : winner;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Região de cada carta para a 2ª passada do OCR (recorte ampliado): da linha do título para baixo,
// limitada pela metade da distância até os títulos vizinhos.
export function cardRegions(cards: Pick<CardRead, 'titleBox' | 'bbox'>[], frameW: number, frameH: number): Region[] {
  const centers = cards.map((c) => cx(c.titleBox));
  return cards.map((c, i) => {
    const center = centers[i];
    let half = Math.max((c.titleBox.x1 - c.titleBox.x0) * 1.4, frameW * 0.12);
    centers.forEach((other, j) => {
      if (j !== i && Math.abs(other - center) > 1) half = Math.min(half, Math.abs(other - center) / 2);
    });
    half = Math.max(half, (c.bbox.x1 - c.bbox.x0) / 2 + 8);
    const x = Math.max(0, Math.floor(center - half));
    const y = Math.max(0, Math.floor(c.titleBox.y0 - h(c.titleBox) * 0.5));
    const bottom = Math.min(frameH, Math.ceil(Math.max(c.bbox.y1 + h(c.titleBox) * 2, c.titleBox.y0 + frameH * 0.45)));
    const right = Math.min(frameW, Math.ceil(center + half));
    return { x, y, width: right - x, height: bottom - y };
  });
}
