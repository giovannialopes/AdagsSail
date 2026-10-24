// Void Sea Flames (tela "Void Sea Seal"): cada Flame altera a PRÓXIMA escolha de Seal Whisper.
// Textos SS14 do tlidb (54 afixos). O valor é uma estimativa: quanto vale, em média, a melhor carta
// que essa Flame coloca na mesa (usa o valor médio de cada tipo/qualidade de whisper-pool).
import type { PriceMap } from './types';
import { DEFAULT_BASELINE, type Baseline } from './valuation';
import type { Goal } from './goals';
import { expectedCardScore, QUALITIES, TYPES, type CardQuality } from './whisper-pool';
import { normalizeOcr } from './whisper-parser';

type FlameWhisper = (typeof TYPES)[number];

export type Flame =
  | { kind: 'guarantee'; whisper: FlameWhisper; minQuality: CardQuality; raw: string }
  | { kind: 'atLeast2'; whisper: FlameWhisper; minQuality: CardQuality; raw: string }
  | { kind: 'typeQuality'; whisper: FlameWhisper; minQuality: CardQuality; raw: string }
  | { kind: 'allQuality'; minQuality: CardQuality; raw: string }
  | { kind: 'wonderGrade'; minQuality: CardQuality; raw: string };

const WHISPER = String.raw`(Boss\s*Whisper|Whispers?\s*[o0][fr]\s*(?:Wea[l1]th|Wonder|Armament))`;
const QUAL = String.raw`(Normal|Magic|Rare|Legendary)`;

function whisperOf(s: string): FlameWhisper {
  if (/boss/i.test(s)) return 'boss';
  if (/wea[l1]th/i.test(s)) return 'wealth';
  if (/wonder/i.test(s)) return 'wonder';
  return 'armament';
}

const qualityOf = (s: string | undefined): CardQuality => (s ? (s.toLowerCase() as CardQuality) : 'normal');

// "of" sai como "or"/"0f" no OCR do texto pequeno do jogo.
const OF = String.raw`[o0][fr]`;

export function parseFlame(text: string): Flame | null {
  const t = normalizeOcr(text.replace(/\s+/g, ' '));
  let m = new RegExp(`at\\s*least\\s*(?:one|1)\\s*(fine|precious)\\s*Whisper\\s*${OF}\\s*Wonder`, 'i').exec(t);
  if (m) return { kind: 'wonderGrade', minQuality: m[1].toLowerCase() === 'precious' ? 'legendary' : 'rare', raw: t };
  m = new RegExp(`at\\s*least\\s*2\\s*selectable\\s*Seal\\s*Whispers\\s*become\\s*${WHISPER}(?:\\s*${OF}\\s*${QUAL})?`, 'i').exec(t);
  if (m) return { kind: 'atLeast2', whisper: whisperOf(m[1]), minQuality: qualityOf(m[2]), raw: t };
  m = new RegExp(`${WHISPER}(?:\\s*${OF}\\s*${QUAL}\\s*quality(?:\\s*or\\s*higher)?)?\\s*is\\s*guaranteed`, 'i').exec(t);
  if (m) return { kind: 'guarantee', whisper: whisperOf(m[1]), minQuality: qualityOf(m[2]), raw: t };
  m = new RegExp(`(?:all\\s*)?Seal\\s*Whispers\\s*become\\s*${QUAL}\\s*quality`, 'i').exec(t);
  if (m) return { kind: 'allQuality', minQuality: qualityOf(m[1]), raw: t };
  m = new RegExp(`${WHISPER}\\s*become\\s*${QUAL}\\s*quality`, 'i').exec(t);
  if (m) return { kind: 'typeQuality', whisper: whisperOf(m[1]), minQuality: qualityOf(m[2]), raw: t };
  return null;
}

// Média do valor de cartas com qualidade >= minQuality (as qualidades acima são mais raras: peso 1/2).
function atLeast(type: FlameWhisper, q: CardQuality, prices: PriceMap, b: Baseline, goal: Goal = 'fe'): number {
  const qs = QUALITIES.slice(QUALITIES.indexOf(q));
  let sum = 0;
  let weight = 0;
  qs.forEach((qq, i) => {
    const w = 1 / 2 ** i;
    sum += w * expectedCardScore(type, qq, goal, prices, b);
    weight += w;
  });
  return sum / weight;
}

// Chance de um tipo aparecer entre as 3 opções sem ajuda (4 tipos).
const APPEAR = 1 - (3 / 4) ** 3;

// Valor na unidade do objetivo (FE por padrão).
export function flameValue(f: Flame, prices: PriceMap, b: Baseline = DEFAULT_BASELINE, goal: Goal = 'fe'): number {
  switch (f.kind) {
    case 'guarantee':
      return atLeast(f.whisper, f.minQuality, prices, b, goal);
    case 'atLeast2':
      return atLeast(f.whisper, f.minQuality, prices, b, goal) * 1.1; // melhor de 2
    case 'wonderGrade':
      return atLeast('wonder', f.minQuality, prices, b, goal);
    case 'typeQuality':
      return atLeast(f.whisper, f.minQuality, prices, b, goal) * APPEAR;
    case 'allQuality': {
      // as 3 opções sobem de qualidade: vale o melhor tipo comum nessa qualidade
      // (Boss Whisper quase só aparece com Flame/talento próprio, então não entra aqui)
      return Math.max(...TYPES.filter((t) => t !== 'boss').map((t) => atLeast(t, f.minQuality, prices, b, goal))) * 1.2;
    }
  }
}

export function describeFlame(f: Flame): string {
  const W: Record<FlameWhisper, string> = { wealth: 'Wealth', wonder: 'Wonder', armament: 'Armament', boss: 'Boss' };
  const Qn: Record<CardQuality, string> = { normal: 'Normal', magic: 'Magic+', rare: 'Rare+', legendary: 'Legendary' };
  switch (f.kind) {
    case 'guarantee':
      return `${W[f.whisper]} ${Qn[f.minQuality]} garantido`;
    case 'atLeast2':
      return `2+ cartas ${W[f.whisper]} ${Qn[f.minQuality]}`;
    case 'wonderGrade':
      return `Wonder ${Qn[f.minQuality]} garantido`;
    case 'typeQuality':
      return `${W[f.whisper]} vira ${Qn[f.minQuality]}`;
    case 'allQuality':
      return `todas viram ${Qn[f.minQuality]}`;
  }
}
