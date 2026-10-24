// Objetivo de farm escolhido no painel. Cada objetivo pontua uma carta pelo quanto ela aumenta,
// no baú desta rodada, o item que o jogador quer (e não pelo FE).
//  - scrap/thread: unidades esperadas no baú = (baú base + extras) × (1 + soma dos ×2/×3)
//  - hero (vermelha): a chance de vermelha cresce com quantidade × raridade → Hero Memories
//    "ponderadas por raridade" = (base + extras) × (1 + Drop Rarity × heroRarityFactor)
//  - invitation: Invitations esperadas
//  - fe: valor em FE (como antes)
import { baseExpected, DEFAULT_BASELINE, EMPTY_ROUND, units, type Baseline, type RoundContext } from './valuation';
import type { Affix, AffixItem } from './whisper-parser';

export type Goal = 'fe' | 'hero' | 'scrap' | 'thread' | 'invitation';
export const GOALS: Goal[] = ['fe', 'hero', 'scrap', 'thread', 'invitation'];

export const GOAL_LABEL: Record<Goal, string> = {
  fe: 'Máximo FE',
  hero: 'Hero Memory (vermelha)',
  scrap: 'Memory Scrap',
  thread: 'Memory Thread',
  invitation: 'Invitation',
};

function delta(affixes: Affix[], b: Baseline): { extra: Record<AffixItem, number>; mult: Record<AffixItem, number>; rarity: number } {
  const extra: Record<AffixItem, number> = { scrap: 0, thread: 0, hero: 0, invitation: 0 };
  const mult: Record<AffixItem, number> = { scrap: 0, thread: 0, hero: 0, invitation: 0 };
  let rarity = 0;
  for (const a of affixes) {
    for (const [item, u] of Object.entries(units(a, b)) as [AffixItem, number][]) extra[item] += u;
    if (a.kind === 'multiply') mult[a.item] += (a.pct / 100) * (a.times - 1);
    if (a.kind === 'rarity') rarity += a.pct / 100;
  }
  return { extra, mult, rarity };
}

const base = (item: AffixItem, b: Baseline) => {
  const { chance, qty } = baseExpected(item, b);
  return chance * qty;
};

// Quanto a carta aumenta o objetivo (unidades do item; FE fica a cargo de valueAffixes).
export function goalScore(affixes: Affix[], goal: Exclude<Goal, 'fe'>, b: Baseline = DEFAULT_BASELINE, round: RoundContext = EMPTY_ROUND): number {
  const d = delta(affixes, b);
  if (goal === 'invitation') return d.extra.invitation;
  if (goal === 'hero') {
    const T = base('hero', b) + round.extra.hero;
    const R = 1 + round.rarity * b.heroRarityFactor;
    return (T + d.extra.hero) * (R + d.rarity * b.heroRarityFactor) - T * R;
  }
  const T = base(goal, b) + round.extra[goal];
  const M = 1 + round.mult[goal];
  return (T + d.extra[goal]) * (M + d.mult[goal]) - T * M;
}

export function formatGoal(goal: Goal, score: number): string {
  const n = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));
  switch (goal) {
    case 'scrap':
      return `+${n(score)} Scraps`;
    case 'thread':
      return `+${n(score)} Threads`;
    case 'hero':
      return `+${score.toFixed(2)} Hero Mem.★`;
    case 'invitation':
      return `+${score.toFixed(2)} Invitation`;
    case 'fe':
      return `${n(score)} FE`;
  }
}
