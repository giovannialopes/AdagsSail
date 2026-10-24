// Tela "Void Sea Seal" (colocar Void Sea Flames). Só a Flame selecionada mostra o texto, no centro
// (medido em prints reais 1920x1080: ~0,59..0,65 da altura, centralizado). Cada clique numa Flame
// (S2_System_Fire_Click no log) dispara uma leitura; a sessão guarda todas as Flames já vistas.
import type { Region } from './layout';
import type { PriceMap } from './types';
import { DEFAULT_BASELINE, type Baseline } from './valuation';
import { describeFlame, flameValue, parseFlame, type Flame } from './flames';
import { GOALS, type Goal } from './goals';
import type { CardQuality } from './whisper-pool';

export const SEAL_LAYOUT = { halfWidth: 0.22, top: 0.585, height: 0.075, iconY: 0.5, iconHalf: 0.022 };

export function sealTextRegion(client: Region): Region {
  const H = client.height;
  const cx = client.x + client.width / 2;
  return {
    x: Math.round(cx - SEAL_LAYOUT.halfWidth * H),
    y: Math.round(client.y + SEAL_LAYOUT.top * H),
    width: Math.round(SEAL_LAYOUT.halfWidth * 2 * H),
    height: Math.round(SEAL_LAYOUT.height * H),
  };
}

// Ícone da Flame selecionada (centro do selo): a cor dá a raridade da Flame.
export function sealIconRegion(client: Region): Region {
  const H = client.height;
  const cx = client.x + client.width / 2;
  const half = SEAL_LAYOUT.iconHalf * H;
  return { x: Math.round(cx - half), y: Math.round(client.y + SEAL_LAYOUT.iconY * H - half), width: Math.round(half * 2), height: Math.round(half * 2) };
}

export interface SeenFlame {
  key: string;
  flame: Flame;
  label: string;
  valueFE: number;
  values: Record<Goal, number>;
  pos?: { x: number; y: number; size: number }; // onde a Flame está na tela (pixels do frame)
  quality: CardQuality | 'unknown';
  seenAt: number;
}

export class SealSession {
  private flames = new Map<string, SeenFlame>();
  current: string | null = null;
  openedAt = Date.now();

  constructor(public goal: Goal = 'fe') {}

  // Devolve a Flame lida (ou null se o texto não for de uma Flame).
  add(
    text: string,
    quality: CardQuality | 'unknown',
    prices: PriceMap,
    b: Baseline = DEFAULT_BASELINE,
    pos?: { x: number; y: number; size: number },
  ): SeenFlame | null {
    const flame = parseFlame(text);
    if (!flame) return null;
    const label = describeFlame(flame);
    const values = Object.fromEntries(GOALS.map((g) => [g, flameValue(flame, prices, b, g)])) as Record<Goal, number>;
    const old = this.flames.get(label);
    if (pos) {
      // cada lugar do selo tem uma Flame só: quem estava "nesse lugar" perde a posição
      for (const other of this.flames.values()) {
        if (other.key !== label && other.pos && Math.hypot(other.pos.x - pos.x, other.pos.y - pos.y) < Math.max(other.pos.size, pos.size) * 0.6) {
          other.pos = undefined;
        }
      }
    }
    const seen: SeenFlame = { key: label, flame, label, valueFE: values.fe, values, quality, seenAt: Date.now(), pos: pos ?? old?.pos };
    this.flames.set(label, seen);
    this.current = label;
    return seen;
  }

  // Se nenhuma Flame ajuda o objetivo, ranqueia por FE.
  effectiveGoal(): Goal {
    if (this.goal === 'fe') return 'fe';
    return [...this.flames.values()].some((f) => f.values[this.goal] > 1e-6) ? this.goal : 'fe';
  }

  ranked(): SeenFlame[] {
    const g = this.effectiveGoal();
    return [...this.flames.values()].sort((a, b) => b.values[g] - a.values[g] || b.valueFE - a.valueFE);
  }

  bestKey(): string | null {
    return this.ranked()[0]?.key ?? null;
  }

  get size(): number {
    return this.flames.size;
  }
}
