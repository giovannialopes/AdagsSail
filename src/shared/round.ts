// Rodada do Blacksail: as 6 cartas escolhidas que abrem juntas o Void Sea Treasure.
// O log diz a raridade da carta escolhida (VoidAltarCoord_Rarity<N>SelectedBtn); com as cartas
// lidas na tela dá para saber qual foi (se houver duas da mesma raridade, fica a de maior valor).
import type { EvaluatedCard } from './session';
import { DEFAULT_BASELINE, roundContext, type Baseline, type RoundContext } from './valuation';
import { QUALITIES } from './whisper-pool';

export interface PickResult {
  card: EvaluatedCard | null;
  rarity: number;
  ambiguous: boolean;
}

export const ROUND_SIZE = 6;

export class Round {
  picks: PickResult[] = [];
  number = 1;

  context(b: Baseline = DEFAULT_BASELINE): RoundContext {
    return roundContext(
      this.picks.filter((p) => p.card).map((p) => p.card!.affixes),
      b,
    );
  }

  pick(rarity: number, shown: EvaluatedCard[]): PickResult {
    const quality = QUALITIES[rarity - 1];
    const same = shown.filter((c) => c.quality === quality);
    const sorted = [...same].sort((a, b) => b.value.totalFE - a.value.totalFE);
    const result: PickResult = { card: sorted[0] ?? null, rarity, ambiguous: same.length > 1 };
    this.picks.push(result);
    return result;
  }

  // O log informa quantas escolhas faltam; se voltou a 6 sem baú, começou outra rodada.
  syncLeft(left: number): void {
    if (left >= ROUND_SIZE && this.picks.length) this.reset();
  }

  finish(): PickResult[] {
    const done = this.picks;
    this.reset();
    return done;
  }

  private reset(): void {
    this.picks = [];
    this.number++;
  }
}
