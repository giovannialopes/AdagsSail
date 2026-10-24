import { ID_BY_KEY } from './items';
import type { PriceMap } from './types';
import type { Affix, AffixItem } from './whisper-parser';

// Linha de base do Void Sea Treasure SEM nenhum Whisper. Ninguém publicou esses números para a SS14,
// então são estimativas (editáveis em settings.json). Afixos que dependem delas saem como "estimado".
export interface Baseline {
  scrapChance: number;
  scrapQty: number;
  threadChance: number;
  threadQty: number;
  heroChance: number;
  heroQty: number;
  threadMix: { magic: number; rare: number; epic: number };
  invitationMix: { craving: number; ecstasy: number; sorrow: number };
  heroMemoryFE: number;
  // Drop Rarity (tooltip do jogo: "rarity of gear and Hero Memories"): +100% de raridade multiplica
  // o valor médio de uma Hero Memory por (1 + heroRarityFactor). Estimativa — é loteria.
  heroRarityFactor: number;
  // Boss Whisper = "X% de chance de 1 Invitation" (comunidade relata 20% e 40%; SS14 não publicado).
  bossInvitationChance: { normal: number; magic: number; rare: number; legendary: number };
}

export const DEFAULT_BASELINE: Baseline = {
  // Baú base medido na rodada de 23/10/2026 só com 1 Wealth (+15 Scraps) e 5 Boss Whispers:
  // 73 Scraps (≈58 do baú base) e 5 Thread Epic. Média de 54 baús reais: 165 Scraps, 7,7 Threads.
  scrapChance: 0.8,
  scrapQty: 72,
  threadChance: 0.8,
  threadQty: 6,
  heroChance: 0.3,
  heroQty: 2,
  // Nos 54 baús reais do usuário (SS14) só caiu Thread Epic e só Invitation Craving.
  threadMix: { magic: 0, rare: 0, epic: 1 },
  invitationMix: { craving: 1, ecstasy: 0, sorrow: 0 },
  heroMemoryFE: 0.3,
  heroRarityFactor: 1,
  // Valores reais lidos nas cartas SS14 (23/10/2026): Normal 5%, Magic 10%, Rare 20%, Legendary 40%.
  bossInvitationChance: { normal: 5, magic: 10, rare: 20, legendary: 40 },
};

export interface CardValue {
  totalFE: number; // valor esperado (média)
  guaranteedFE: number; // vem sempre (quantidade fixa ou % sobre o baú base)
  chanceFE: number; // média do que depende de sorte (X% de chance...)
  jackpotFE: number; // quanto vem se todas as chances acertarem
  parts: Record<AffixItem, number>;
  estimated: boolean;
  missingPrices: boolean;
}

// Valor esperado do baú sem nenhum afixo (Scraps + Threads + Hero Memories do baú base).
export function baseChestFE(prices: PriceMap, b: Baseline = DEFAULT_BASELINE): number {
  let v = 0;
  for (const item of ['scrap', 'thread', 'hero'] as const) {
    const price = itemPrice(item, prices, b);
    const { chance, qty } = baseExpected(item, b);
    if (price !== null) v += chance * qty * price;
  }
  return v;
}

// Afixos "garantidos": sempre entram no baú (o % sobre o baú base varia com o baú, mas não é sorteio).
export function isGuaranteed(a: Affix): boolean {
  return a.kind === 'flat' || a.kind === 'baseQty' || a.kind === 'treasureQty' || a.kind === 'itemQty';
}

const fe = (prices: PriceMap, key: keyof typeof ID_BY_KEY): number | null => {
  const id = ID_BY_KEY[key];
  return id !== undefined && prices[id] ? prices[id].fe : null;
};

function weighted(all: [number | null, number][]): number | null {
  const pairs = all.filter(([, w]) => w > 0);
  if (!pairs.length || pairs.some(([price]) => price === null)) return null;
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  return pairs.reduce((a, [price, w]) => a + (price as number) * w, 0) / total;
}

function threadPrice(prices: PriceMap, mix: Baseline['threadMix']): number | null {
  return weighted([
    [fe(prices, 'threadMagic'), mix.magic],
    [fe(prices, 'threadRare'), mix.rare],
    [fe(prices, 'threadEpic'), mix.epic],
  ]);
}

export function itemPrice(item: AffixItem, prices: PriceMap, b: Baseline): number | null {
  switch (item) {
    case 'scrap':
      return fe(prices, 'scrap');
    case 'thread':
      return threadPrice(prices, b.threadMix);
    case 'hero':
      return b.heroMemoryFE;
    case 'invitation':
      return weighted([
        [fe(prices, 'invCraving'), b.invitationMix.craving],
        [fe(prices, 'invEcstasy'), b.invitationMix.ecstasy],
        [fe(prices, 'invSorrow'), b.invitationMix.sorrow],
      ]);
  }
}

const BASE_ITEMS: AffixItem[] = ['scrap', 'thread', 'hero'];

export function baseExpected(item: AffixItem, b: Baseline): { chance: number; qty: number } {
  if (item === 'scrap') return { chance: b.scrapChance, qty: b.scrapQty };
  if (item === 'thread') return { chance: b.threadChance, qty: b.threadQty };
  if (item === 'hero') return { chance: b.heroChance, qty: b.heroQty };
  return { chance: 0, qty: 0 };
}

// O que as cartas já escolhidas nesta rodada (até 6, abertas juntas no baú) colocam no baú:
// unidades extras esperadas e multiplicadores (×2/×3 valem para TODOS os Scraps/Threads do baú).
export interface RoundContext {
  extra: Record<AffixItem, number>;
  mult: Record<AffixItem, number>;
  rarity: number; // soma dos +% Drop Rarity já escolhidos (fração)
}

export const EMPTY_ROUND: RoundContext = {
  extra: { scrap: 0, thread: 0, hero: 0, invitation: 0 },
  mult: { scrap: 0, thread: 0, hero: 0, invitation: 0 },
  rarity: 0,
};

export function units(a: Affix, b: Baseline): Partial<Record<AffixItem, number>> {
  switch (a.kind) {
    case 'flat':
      return { [a.item]: a.n };
    case 'chanceFlat':
      return { [a.item]: (a.pct / 100) * a.n };
    case 'appear': {
      const { chance, qty } = baseExpected(a.item, b);
      return { [a.item]: Math.min(1 - chance, chance * (a.pct / 100)) * qty };
    }
    case 'itemQty': {
      const { chance, qty } = baseExpected(a.item, b);
      return { [a.item]: chance * qty * (a.pct / 100) };
    }
    case 'baseQty':
    case 'treasureQty': {
      const out: Partial<Record<AffixItem, number>> = {};
      for (const item of BASE_ITEMS) {
        const { chance, qty } = baseExpected(item, b);
        out[item] = chance * qty * (a.pct / 100);
      }
      return out;
    }
    default:
      return {};
  }
}

export function roundContext(owned: Affix[][], b: Baseline = DEFAULT_BASELINE): RoundContext {
  const ctx: RoundContext = { extra: { ...EMPTY_ROUND.extra }, mult: { ...EMPTY_ROUND.mult }, rarity: 0 };
  for (const a of owned.flat()) {
    if (a.kind === 'multiply') ctx.mult[a.item] += (a.pct / 100) * (a.times - 1);
    if (a.kind === 'rarity') ctx.rarity += a.pct / 100;
    for (const [item, u] of Object.entries(units(a, b)) as [AffixItem, number][]) ctx.extra[item] += u;
  }
  return ctx;
}

export function valueAffixes(
  affixes: Affix[],
  prices: PriceMap,
  b: Baseline = DEFAULT_BASELINE,
  round: RoundContext = EMPTY_ROUND,
): CardValue {
  const parts: Record<AffixItem, number> = { scrap: 0, thread: 0, hero: 0, invitation: 0 };
  let estimated = false;
  let missingPrices = false;

  // Unidades novas também são multiplicadas pelos ×2/×3 que já estão na rodada.
  const add = (item: AffixItem, qty: number, multiplied = true) => {
    const price = itemPrice(item, prices, b);
    if (price === null) {
      missingPrices = true;
      return;
    }
    // Hero Memories novas também ficam melhores com o Drop Rarity que já está na rodada
    const rarity = item === 'hero' ? 1 + round.rarity * b.heroRarityFactor : 1;
    parts[item] += qty * price * rarity * (multiplied ? 1 + round.mult[item] : 1);
  };

  const sum = () => Object.values(parts).reduce((x, y) => x + y, 0);
  let guaranteedFE = 0;
  let chanceFE = 0;
  let jackpotExtra = 0; // o que a mais viria se a chance acertasse

  for (const a of affixes) {
    const before = sum();
    switch (a.kind) {
      case 'flat':
        add(a.item, a.n);
        break;
      case 'chanceFlat': {
        add(a.item, (a.pct / 100) * a.n);
        const price = itemPrice(a.item, prices, b);
        if (price !== null) jackpotExtra += (1 - a.pct / 100) * a.n * price * (1 + round.mult[a.item]);
        break;
      }
      case 'appear': {
        const { chance, qty } = baseExpected(a.item, b);
        add(a.item, Math.min(1 - chance, chance * (a.pct / 100)) * qty);
        estimated = true;
        break;
      }
      case 'itemQty': {
        const { chance, qty } = baseExpected(a.item, b);
        add(a.item, chance * qty * (a.pct / 100));
        estimated = true;
        break;
      }
      case 'multiply': {
        // multiplica o baú base + o que as cartas já escolhidas adicionaram
        const { chance, qty } = baseExpected(a.item, b);
        const pool = chance * qty + round.extra[a.item];
        add(a.item, (a.pct / 100) * (a.times - 1) * pool, false);
        const price = itemPrice(a.item, prices, b);
        if (price !== null) jackpotExtra += (1 - a.pct / 100) * (a.times - 1) * pool * price;
        estimated = true;
        break;
      }
      case 'baseQty':
      case 'treasureQty':
        for (const item of BASE_ITEMS) {
          const { chance, qty } = baseExpected(item, b);
          add(item, chance * qty * (a.pct / 100));
        }
        estimated = true;
        break;
      case 'rarity': {
        // Melhora as Hero Memories do baú (base + as que as cartas já escolhidas adicionaram).
        const { chance, qty } = baseExpected('hero', b);
        const memories = chance * qty + round.extra.hero;
        add('hero', memories * (a.pct / 100) * b.heroRarityFactor, false);
        estimated = true;
        break;
      }
    }
    const delta = sum() - before;
    if (isGuaranteed(a)) guaranteedFE += delta;
    else chanceFE += delta;
  }

  const totalFE = sum();
  return { totalFE, guaranteedFE, chanceFE, jackpotFE: totalFE + jackpotExtra, parts, estimated, missingPrices };
}
