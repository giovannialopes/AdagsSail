// Todos os afixos possíveis de cada Seal Whisper por qualidade (tabelas SS14 do tlidb, bloco normal;
// o bloco dobrado é o efeito do pactspirit Starfish Chanter). Na tela da SS14 cada carta mostra 1 afixo.
import { goalScore, type Goal } from './goals';
import type { Quality } from './layout';
import type { PriceMap } from './types';
import { DEFAULT_BASELINE, valueAffixes, type Baseline } from './valuation';
import { parseAffixes, type WhisperType } from './whisper-parser';

export type CardQuality = Exclude<Quality, 'unknown'>;
export const QUALITIES: CardQuality[] = ['normal', 'magic', 'rare', 'legendary'];
const Q = (q: CardQuality) => QUALITIES.indexOf(q);

const T = 'Void Sea Treasure';
const pick = (values: number[], q: CardQuality) => values[Q(q)];

const wealth = (q: CardQuality) => [
  `+${pick([9, 14, 18, 36], q)}% ${T} Base Drop Quantity`,
  `+${pick([14, 21, 28, 56], q)}% chance for Memory Scraps to appear among base ${T} drops`,
  `+${pick([35, 53, 70, 140], q)}% additional Memory Scrap Drop Quantity in base ${T} drops`,
  `${T}s drop ${pick([10, 15, 19, 39], q)} additional Memory Scrap(s)`,
  `20% chance for ${pick([49, 73, 97, 194], q)} additional Memory Scrap(s) to drop from ${T}s`,
  `+${pick([35, 53, 70, 140], q)}% chance for Memory Threads to appear among base ${T} drops`,
  `+${pick([21, 32, 42, 84], q)}% additional Memory Thread Drop Quantity in base ${T} drops`,
  `${T}s drop ${pick([1, 1, 1, 2], q)} additional Memory Thread(s)`,
  `20% chance for ${pick([3, 4, 5, 10], q)} additional Memory Thread(s) to drop from ${T}s`,
];

const wonder = (q: CardQuality) => [
  `+${pick([9, 14, 18, 36], q)}% ${T} Base Drop Quantity`,
  `+${pick([14, 21, 28, 56], q)}% ${T} Drop Quantity`,
  `+${pick([25, 37, 49, 98], q)}% ${T} Drop Rarity`,
  `+${pick([21, 32, 42, 84], q)}% chance for Memory Scraps dropped from ${T}s to be multiplied by ${q === 'legendary' ? 3 : 2} time(s)`,
  `+${pick([21, 32, 42, 84], q)}% chance for Memory Threads dropped from ${T}s to be multiplied by ${q === 'legendary' ? 3 : 2} time(s)`,
];

const armament = (q: CardQuality) => [
  `+${pick([9, 14, 18, 36], q)}% ${T} Base Drop Quantity`,
  `+${pick([28, 42, 56, 112], q)}% chance for Hero Memories to appear among base ${T} drops`,
  `+${pick([21, 32, 42, 84], q)}% additional Hero Memory Drop Quantity in base ${T} drops`,
  `${pick([2, 3, 4, 8], q)} additional Hero Memory(ies) drop from ${T}s`,
  `20% chance for ${pick([8, 12, 17, 33], q)} additional Hero Memory(ies) to drop from ${T}s`,
];

// Boss Whisper: valores SS14 não publicados; comunidade relata "X% de chance de 1 Invitation" (settings).
const boss = (q: CardQuality, b: Baseline) => [`${b.bossInvitationChance[q]}% chance for 1 additional Void Sea Invitation(s) to drop from ${T}s`];

export function poolTexts(type: Exclude<WhisperType, 'unknown'>, q: CardQuality, b: Baseline = DEFAULT_BASELINE): string[] {
  if (type === 'wealth') return wealth(q);
  if (type === 'wonder') return wonder(q);
  if (type === 'armament') return armament(q);
  return boss(q, b);
}

export const TYPES = ['wealth', 'wonder', 'armament', 'boss'] as const;

// Valor médio (FE) de uma carta desse tipo e qualidade: média dos afixos possíveis.
export function expectedCardFE(type: (typeof TYPES)[number], q: CardQuality, prices: PriceMap, b: Baseline = DEFAULT_BASELINE): number {
  return expectedCardScore(type, q, 'fe', prices, b);
}

// Mesma média, mas na unidade do objetivo de farm (Scraps, Threads, Hero Memories★, Invitations ou FE).
export function expectedCardScore(
  type: (typeof TYPES)[number],
  q: CardQuality,
  goal: Goal,
  prices: PriceMap,
  b: Baseline = DEFAULT_BASELINE,
): number {
  const texts = poolTexts(type, q, b);
  const total = texts.reduce((sum, t) => {
    const affixes = parseAffixes(t).affixes;
    return sum + (goal === 'fe' ? valueAffixes(affixes, prices, b).totalFE : goalScore(affixes, goal, b));
  }, 0);
  return total / texts.length;
}
