// Overlay sobre o jogo: só marcas — etiqueta de valor em cada carta/Flame e destaque na melhor.
// O ranking e o resumo da rodada ficam no painel do AdagsSail.
import type { OverlayCard, OverlayState } from '../shared/ipc';
import { bridge, el, fmtFE } from './common';

const marks = document.getElementById('marks')!;

function valueText(c: OverlayCard): string {
  if (c.missingPrices && c.totalFE === 0) return 'sem preço';
  return `${c.estimated ? '≈' : ''}${fmtFE(c.totalFE)} FE`;
}

function mainText(s: OverlayState, c: OverlayCard): string {
  return s.goal === 'fe' ? valueText(c) : c.goalText;
}

// 'garantido 1.1 · chance 7.2 (até 18)'
function splitText(c: OverlayCard): string {
  const out: string[] = [];
  if (c.guaranteedFE > 0.005) out.push(`garantido ${fmtFE(c.guaranteedFE)}`);
  if (c.chanceFE > 0.005) out.push(`chance ${fmtFE(c.chanceFE)} (até ${fmtFE(c.jackpotFE - c.guaranteedFE)})`);
  return out.join(' · ');
}

function renderCards(s: OverlayState, sx: number, sy: number): void {
  for (const c of s.cards) {
    if (!c.visible) continue;
    const best = c.key === s.bestKey;
    if (best) {
      const ring = el('div', 'ring');
      const pad = 10;
      Object.assign(ring.style, {
        left: `${c.bbox.x0 * sx - pad}px`,
        top: `${c.bbox.y0 * sy - pad}px`,
        width: `${(c.bbox.x1 - c.bbox.x0) * sx + pad * 2}px`,
        height: `${(c.bbox.y1 - c.bbox.y0) * sy + pad * 2}px`,
      });
      marks.append(ring);
    }
    const tag = el('div', `tag${best ? ' best' : ''}`);
    if (best) tag.append(el('span', 'crown', '★ MELHOR'));
    tag.append(el('div', 'fe', mainText(s, c)));
    const split = splitText(c);
    const sub = s.goal === 'fe' ? split : [valueText(c), split].filter(Boolean).join(' · ');
    if (sub) tag.append(el('div', 'parts', sub));
    if (c.lowConfidence || c.unknown.length) tag.append(el('div', 'parts warn', 'leitura incerta'));
    Object.assign(tag.style, {
      left: `${((c.titleBox.x0 + c.titleBox.x1) / 2) * sx}px`,
      top: `${c.titleBox.y0 * sy - 8}px`,
    });
    marks.append(tag);
  }
}

function renderFlames(s: OverlayState, sx: number, sy: number): void {
  for (const f of s.flames) {
    if (!f.pos) continue;
    const best = f.key === s.bestFlameKey;
    const r = Math.max(f.pos.size * 0.9, 34) * sx;
    if (best) {
      const ring = el('div', 'flame-ring');
      Object.assign(ring.style, { left: `${f.pos.x * sx - r}px`, top: `${f.pos.y * sy - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
      marks.append(ring);
    }
    const tag = el('div', `tag flame-tag${best ? ' best' : ''}`);
    if (best) tag.append(el('span', 'crown', '★ MELHOR'));
    tag.append(el('div', 'fe', s.goal === 'fe' ? `≈${fmtFE(f.valueFE)} FE` : `≈${f.goalText}`));
    tag.title = f.label;
    Object.assign(tag.style, { left: `${f.pos.x * sx}px`, top: `${f.pos.y * sy - r - 4}px` });
    marks.append(tag);
  }
}

function render(s: OverlayState): void {
  marks.replaceChildren();
  if (!s.show) return;
  const sx = window.innerWidth / s.frameW;
  const sy = window.innerHeight / s.frameH;
  if (s.mode === 'flames') renderFlames(s, sx, sy);
  else renderCards(s, sx, sy);
}

bridge.on('overlay:update', (s) => render(s as OverlayState));
