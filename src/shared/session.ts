// Acumula as cartas lidas enquanto a tela de escolha está aberta e decide a melhor
// conforme o objetivo de farm escolhido (FE, Hero Memory, Scrap, Thread ou Invitation).
import { goalScore, GOALS, type Goal } from './goals';
import type { CardRead } from './layout';
import type { PriceMap } from './types';
import { DEFAULT_BASELINE, EMPTY_ROUND, valueAffixes, type Baseline, type CardValue, type RoundContext } from './valuation';
import { parseAffixes, type Affix } from './whisper-parser';

export const LOW_CONF = 60;
// Com leitura incerta, só coroa se a vantagem for maior que essa fração.
const UNCERTAIN_MARGIN = 0.15;

export interface EvaluatedCard extends CardRead {
  key: string;
  affixes: Affix[];
  unknown: string[];
  value: CardValue;
  scores: Record<Goal, number>; // pontuação em cada objetivo (fe = totalFE)
  lowConfidence: boolean;
}

const signature = (a: Affix) => a.raw.toLowerCase().replace(/[^a-z0-9%]/g, '');

export function evaluateCard(
  read: CardRead,
  prices: PriceMap,
  baseline: Baseline = DEFAULT_BASELINE,
  round: RoundContext = EMPTY_ROUND,
): EvaluatedCard {
  const { affixes, unknown } = parseAffixes(read.lines.join('\n'));
  const value = valueAffixes(affixes, prices, baseline, round);
  const scores = Object.fromEntries(
    GOALS.map((g) => [g, g === 'fe' ? value.totalFE : goalScore(affixes, g, baseline, round)]),
  ) as Record<Goal, number>;
  return {
    ...read,
    key: `${read.type}|${affixes.map(signature).join('|')}`,
    affixes,
    unknown,
    value,
    scores,
    lowConfidence: read.conf < LOW_CONF,
  };
}

export class ChoiceSession {
  private cards = new Map<string, EvaluatedCard>();
  openedAt = Date.now();

  constructor(public goal: Goal = 'fe') {}

  // Devolve as chaves das cartas deste frame (já mescladas com leituras anteriores).
  add(reads: CardRead[], prices: PriceMap, baseline: Baseline = DEFAULT_BASELINE, round: RoundContext = EMPTY_ROUND): string[] {
    const seen: string[] = [];
    for (const read of reads) {
      const card = evaluateCard(read, prices, baseline, round);
      if (read.slot !== undefined) {
        seen.push(this.addSlot(card, read.slot));
        continue;
      }
      const sigs = new Set(card.affixes.map(signature));
      let merged = false;
      for (const [key, old] of this.cards) {
        if (old.type !== card.type) continue;
        const oldSigs = old.affixes.map(signature);
        const overlap = oldSigs.filter((s) => sigs.has(s)).length;
        // Mesma carta lida de novo (parcial ou completa): fica a leitura mais completa.
        if (overlap && (overlap === oldSigs.length || overlap === sigs.size)) {
          if (card.affixes.length >= old.affixes.length) {
            this.cards.delete(key);
            this.cards.set(card.key, card);
            seen.push(card.key);
          } else {
            this.cards.set(key, { ...old, bbox: card.bbox, titleBox: card.titleBox });
            seen.push(key);
          }
          merged = true;
          break;
        }
      }
      if (!merged && (card.affixes.length || card.unknown.length)) {
        this.cards.set(card.key, card);
        seen.push(card.key);
      }
    }
    return seen;
  }

  // Carta numa posição fixa: fica a leitura mais limpa; uma leitura limpa e diferente (Switch) substitui.
  private addSlot(card: EvaluatedCard, slot: number): string {
    const prefix = `slot${slot}|`;
    const oldKey = [...this.cards.keys()].find((k) => k.startsWith(prefix));
    const old = oldKey ? this.cards.get(oldKey)! : null;
    const score = (c: EvaluatedCard) => c.affixes.length * 2 - c.unknown.length - (c.lowConfidence ? 1 : 0);
    const clean = card.affixes.length > 0 && card.unknown.length === 0;
    const key = prefix + card.key;
    if (!old || (clean && key !== oldKey) || score(card) >= score(old)) {
      if (oldKey) this.cards.delete(oldKey);
      this.cards.set(key, { ...card, key });
      return key;
    }
    this.cards.set(oldKey!, { ...old, bbox: card.bbox, titleBox: card.titleBox });
    return oldKey!;
  }

  // Objetivo efetivo: se nenhuma carta ajuda o objetivo escolhido, vale o FE (para ainda orientar).
  effectiveGoal(): Goal {
    if (this.goal === 'fe') return 'fe';
    return [...this.cards.values()].some((c) => c.scores[this.goal] > 1e-6) ? this.goal : 'fe';
  }

  ranked(): EvaluatedCard[] {
    const g = this.effectiveGoal();
    return [...this.cards.values()].sort((a, b) => b.scores[g] - a.scores[g] || b.value.totalFE - a.value.totalFE);
  }

  bestKey(): string | null {
    const g = this.effectiveGoal();
    const [first, second] = this.ranked();
    if (!first || first.scores[g] <= 0) return null;
    if (second && (first.lowConfidence || second.lowConfidence)) {
      if (first.scores[g] - second.scores[g] < first.scores[g] * UNCERTAIN_MARGIN) return null;
    }
    return first.key;
  }

  get size(): number {
    return this.cards.size;
  }
}
