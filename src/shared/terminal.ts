// Layout da tela de escolha "Void Sea Terminal" da SS14 (medido em prints reais 1920x1080):
// 3 cartas lado a lado; título em ~58% da altura e o afixo logo abaixo. A interface escala pela
// altura e fica centralizada, então as posições são frações da altura a partir do centro.
import type { BBox, CardRead, OcrLine, Region } from './layout';
import { titleType } from './whisper-parser';

export const TERMINAL_LAYOUT = {
  centers: [-0.3208, 0, 0.3333],
  halfWidth: 0.165,
  top: 0.575,
  height: 0.12,
};

// `client` = área útil do jogo dentro do frame capturado (sem barra de título).
export function terminalRegions(client: Region): Region[] {
  const H = client.height;
  const cx = client.x + client.width / 2;
  return TERMINAL_LAYOUT.centers.map((c) => {
    const x = Math.round(cx + c * H - TERMINAL_LAYOUT.halfWidth * H);
    return {
      x: Math.max(client.x, x),
      y: Math.round(client.y + TERMINAL_LAYOUT.top * H),
      width: Math.round(TERMINAL_LAYOUT.halfWidth * 2 * H),
      height: Math.round(TERMINAL_LAYOUT.height * H),
    };
  });
}

const union = (a: BBox, b: BBox): BBox => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

// Linhas OCR de uma região (já em coordenadas do frame) → carta, se houver título de Whisper.
export function readSlot(lines: OcrLine[], slot: number): Omit<CardRead, 'quality'> | null {
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const i = sorted.findIndex((l) => titleType(l.text) !== 'unknown');
  if (i < 0) return null;
  const title = sorted[i];
  const body = sorted.slice(i + 1);
  const confs = [title.conf, ...body.map((l) => l.conf)];
  return {
    type: titleType(title.text),
    title: title.text.trim(),
    titleBox: title.bbox,
    bbox: body.reduce((b, l) => union(b, l.bbox), title.bbox),
    lines: body.map((l) => l.text.trim()),
    conf: confs.reduce((a, b) => a + b, 0) / confs.length,
    slot,
  };
}
