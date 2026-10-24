// Leitura das cartas.
//  - readTerminal: layout fixo da tela "Void Sea Terminal" da SS14 (3 recortes, rápido, ~0,5 s).
//  - readCards: genérico (qualquer layout) em duas passadas: OCR da tela inteira acha os títulos,
//    depois cada carta é recortada e ampliada 2x ("%" vira "9" no texto pequeno sem ampliar).
import { cardRegions, classifyQuality, groupCards, type CardRead, type OcrLine, type Region } from '../shared/layout';
import { parseFlame } from '../shared/flames';
import { findSelectedFlame, flameNear } from '../shared/flameslots';
import { ANCHORS, uiUnit, unitFromAnchor } from '../shared/uiscale';
import { regionSignature } from '../shared/signature';
import { sealIconRegion, sealTextRegion } from '../shared/seal';
import { readSlot, terminalRegions } from '../shared/terminal';
import { parseAffixes } from '../shared/whisper-parser';
import { ocrImage, type Frame } from './capture';
import type { GameWindow } from './game-window';
import { recognize, type OcrMode } from './ocr';

const UPSCALE = 2;

export interface CardScan {
  lines: OcrLine[];
  reads: CardRead[];
  ms: number;
}

// `unit`: unidade de interface. Interface menor que 1080 (janela pequena) → amplia mais, para o texto
// chegar ao OCR com o mesmo tamanho de uma janela 1920x1080.
async function ocrRegion(frame: Frame, r: Region, mode: OcrMode, stretch = false, unit = 1080): Promise<OcrLine[]> {
  const k = Math.min(4, Math.max(UPSCALE, (UPSCALE * 1080) / unit));
  const image = frame.image.crop(r).resize({ width: Math.round(r.width * k), quality: 'best' });
  const { width, height } = image.getSize();
  const lines = await recognize(ocrImage({ image, bgra: image.toBitmap(), width, height, method: frame.method }, stretch), mode);
  return lines.map((l) => ({
    ...l,
    bbox: {
      x0: r.x + l.bbox.x0 / k,
      y0: r.y + l.bbox.y0 / k,
      x1: r.x + l.bbox.x1 / k,
      y1: r.y + l.bbox.y1 / k,
    },
  }));
}

// Calibração: acha uma âncora de texto abaixo do centro (OCR esparso) e mede a unidade de interface.
// Várias âncoras possíveis: usa a primeira que o OCR encontrar.
async function calibrateUnit(frame: Frame, client: Region, anchors: [RegExp, number][]): Promise<number | null> {
  const band: Region = {
    x: Math.round(client.x + client.width * 0.2),
    y: Math.round(client.y + client.height / 2),
    width: Math.round(client.width * 0.6),
    height: Math.round(client.height / 2),
  };
  // amplia mais que o normal: a escala ainda é desconhecida (pode ser pequena)
  const lines = await ocrRegion(frame, band, 'sparse', false, Math.min(client.height, 1080) * 0.75);
  for (const [re, offset] of anchors) {
    const hit = lines.find((l) => re.test(l.text));
    const u = hit ? unitFromAnchor((hit.bbox.y0 + hit.bbox.y1) / 2, client, offset) : null;
    if (u) return u;
  }
  return null;
}

export const calibrateSeal = (frame: Frame, client: Region) =>
  calibrateUnit(frame, client, [
    [/^\W*c[o0]nf[il1]rm\W*$/i, ANCHORS.sealConfirm],
    [/^\W*selectable\s*seal\s*whispers\W*$/i, ANCHORS.sealSelectable],
  ]);
export const calibrateTerminal = (frame: Frame, client: Region) => calibrateUnit(frame, client, [[/select\s*a\s*seal\s*whisper/i, ANCHORS.terminalSelect]]);

// Área útil do jogo dentro do frame (o frame pode vir em escala diferente da janela).
export function clientRegion(frame: Frame, game: GameWindow | null): Region {
  if (!game || !game.rect.width) return { x: 0, y: 0, width: frame.width, height: frame.height };
  const sx = frame.width / game.rect.width;
  const sy = frame.height / game.rect.height;
  return {
    x: Math.round(game.client.x * sx),
    y: Math.round(game.client.y * sy),
    width: Math.min(frame.width, Math.round(game.client.width * sx)),
    height: Math.min(frame.height, Math.round(game.client.height * sy)),
  };
}

export async function readTerminal(frame: Frame, client: Region, unit: number = uiUnit(client)): Promise<CardScan> {
  const t0 = Date.now();
  const lines: OcrLine[] = [];
  const reads: CardRead[] = [];
  const regions = terminalRegions(client, unit);
  for (let slot = 0; slot < regions.length; slot++) {
    // Versão simples primeiro; se a leitura não sair limpa, tenta com contraste esticado.
    let best: { card: ReturnType<typeof readSlot>; lines: OcrLine[]; score: number } | null = null;
    for (const stretch of [false, true]) {
      const slotLines = await ocrRegion(frame, regions[slot], 'block', stretch, unit);
      const card = readSlot(slotLines, slot);
      const parsed = card ? parseAffixes(card.lines.join('\n')) : null;
      const score = parsed ? 1 + parsed.affixes.length * 2 - parsed.unknown.length : 0;
      if (!best || score > best.score) best = { card, lines: slotLines, score };
      if (parsed && parsed.affixes.length && !parsed.unknown.length) break;
    }
    lines.push(...best!.lines);
    const card = best!.card;
    if (card) reads.push({ ...card, quality: classifyQuality(frame.bgra, frame.width, card.titleBox, true) });
  }
  return { lines, reads, ms: Date.now() - t0 };
}

export async function readCards(frame: Frame): Promise<CardScan> {
  const t0 = Date.now();
  const lines = await recognize(ocrImage(frame));
  const groups = groupCards(lines, frame.width);
  const regions = cardRegions(groups, frame.width, frame.height);
  const reads: CardRead[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const r = regions[i];
    let best = g;
    if (r.width > 20 && r.height > 20) {
      const zoomed = await ocrRegion(frame, r, 'sparse');
      const again = groupCards(zoomed, frame.width).find((c) => c.type === g.type);
      if (again && again.lines.length >= g.lines.length) best = again;
    }
    reads.push({ ...best, quality: classifyQuality(frame.bgra, frame.width, g.titleBox, true) });
  }
  return { lines, reads, ms: Date.now() - t0 };
}

export interface FlameScan {
  text: string;
  quality: ReturnType<typeof classifyQuality>;
  lines: OcrLine[];
  ms: number;
  pos: { x: number; y: number; size: number } | null; // Flame selecionada na tela
}

// Tela "Void Sea Seal": texto da Flame selecionada (centro) + cor do ícone (raridade da Flame).
// Parte barata (sem OCR, ~15 ms): assinatura do texto, Flame selecionada e cor do ícone.
// `click`: onde o jogador clicou (pixels do frame). Com clique, a Flame é o ícone mais perto dele;
// sem clique (tela acabou de abrir), cai na detecção pelo contorno.
export function sealQuick(frame: Frame, client: Region, unit: number = uiUnit(client), click?: { x: number; y: number }) {
  const icon = sealIconRegion(client, unit);
  return {
    sig: regionSignature(frame.bgra, frame.width, sealTextRegion(client, unit)),
    pos: click ? flameNear(frame.bgra, frame.width, client, click, unit) : findSelectedFlame(frame.bgra, frame.width, client, unit),
    quality: classifyQuality(frame.bgra, frame.width, { x0: icon.x, y0: icon.y, x1: icon.x + icon.width, y1: icon.y + icon.height }, true, 0.6),
  };
}

// Parte cara (~250 ms): OCR do texto da Flame selecionada.
export async function readSealText(frame: Frame, client: Region, unit: number = uiUnit(client)): Promise<string> {
  const region = sealTextRegion(client, unit);
  let lines = await ocrRegion(frame, region, 'block', false, unit);
  if (!parseFlame(lines.map((l) => l.text).join(' '))) lines = await ocrRegion(frame, region, 'block', true, unit);
  return lines.map((l) => l.text).join(' ');
}

export async function readSeal(frame: Frame, client: Region): Promise<FlameScan> {
  const t0 = Date.now();
  const region = sealTextRegion(client);
  let lines = await ocrRegion(frame, region, 'block');
  if (!parseFlame(lines.map((l) => l.text).join(' '))) lines = await ocrRegion(frame, region, 'block', true);
  const icon = sealIconRegion(client);
  const quality = classifyQuality(frame.bgra, frame.width, { x0: icon.x, y0: icon.y, x1: icon.x + icon.width, y1: icon.y + icon.height }, true, 0.6);
  const pos = findSelectedFlame(frame.bgra, frame.width, client);
  return { text: lines.map((l) => l.text).join(' '), quality, lines, ms: Date.now() - t0, pos };
}

// Tela de escolha: tenta o layout fixo; se não achar nada, cai para o genérico.
export async function scanChoice(frame: Frame, game: GameWindow | null, unit?: number): Promise<CardScan & { layout: 'terminal' | 'generic' }> {
  const fixed = await readTerminal(frame, clientRegion(frame, game), unit);
  if (fixed.reads.length) return { ...fixed, layout: 'terminal' };
  const generic = await readCards(frame);
  return { ...generic, ms: generic.ms + fixed.ms, layout: 'generic' };
}
