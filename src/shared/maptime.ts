// Tempo em mapa: soma do tempo fora do hideout/cidade, pelas trocas de nível do UE_game.log
// ("SceneLevelMgr@ OpenMainWorld END! InMainLevelPath = ..."). Padrões de hideout iguais aos do TITrack.
import { parseLogTime } from './blacksail-log';

const LEVEL = /SceneLevelMgr@ OpenMainWorld END! InMainLevelPath = (\S+)/;
const HUB = [/hideout/i, /town/i, /hub/i, /lobby/i, /social/i, /YuJinZhiXiBiNanSuo/i, /ShengTingZhuangYuan(?!000)/i, /ZhuCheng/i, /\/UI\//i, /LoginScene/i];

export function isHub(levelPath: string): boolean {
  return HUB.some((re) => re.test(levelPath));
}

export class MapTimer {
  private totalMs = 0;
  private enteredAt: number | null = null; // epoch do log (UTC) em que entrou num mapa

  feed(line: string): void {
    const m = LEVEL.exec(line);
    if (!m) return;
    const at = parseLogTime(line);
    if (at === null) return;
    if (this.enteredAt !== null) this.totalMs += Math.max(0, at - this.enteredAt);
    this.enteredAt = isHub(m[1]) ? null : at;
  }

  // `now` em epoch: o horário do UE_game.log é UTC, então compara direto com Date.now().
  elapsedMs(now = Date.now()): number {
    return this.totalMs + (this.enteredAt !== null ? Math.max(0, now - this.enteredAt) : 0);
  }

  get inMap(): boolean {
    return this.enteredAt !== null;
  }

  // Só o total acumulado é salvo (ao reabrir o app ainda não sabemos se está num mapa).
  get savedMs(): number {
    return this.elapsedMs();
  }

  restore(totalMs: number): void {
    this.totalMs = Math.max(0, totalMs || 0);
  }

  reset(now = Date.now()): void {
    this.totalMs = 0;
    if (this.enteredAt !== null) this.enteredAt = now;
  }
}
