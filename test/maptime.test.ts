import { describe, expect, it } from 'vitest';
import { isHub, MapTimer } from '../src/shared/maptime';

const lv = (t: string, path: string) => `[2026.10.23-${t}:000][  0]TLLua: Display: [Game] SceneLevelMgr@ OpenMainWorld END! InMainLevelPath = ${path}`;
const HIDEOUT = '/Game/Art/Maps/01SD/XZ_YuJinZhiXiBiNanSuo200/XZ_YuJinZhiXiBiNanSuo200';
const MAP = '/Game/Art/Maps/03YL/YL_MaNeiLaYuLin100/YL_MaNeiLaYuLin100';
const TERMINAL = '/Game/Art/Maps/S2/XuHaiZhongGang/XuHaiZhongGang';

describe('MapTimer (caminhos reais do log SS14)', () => {
  it('reconhece hideout e mapas', () => {
    expect(isHub(HIDEOUT)).toBe(true);
    expect(isHub(MAP)).toBe(false);
    expect(isHub(TERMINAL)).toBe(false);
  });

  it('soma só o tempo fora do hideout', () => {
    const t = new MapTimer();
    t.feed(lv('20.00.00', HIDEOUT));
    t.feed(lv('20.01.00', MAP)); // entra
    t.feed(lv('20.03.30', TERMINAL)); // troca de mapa: continua contando
    t.feed(lv('20.05.00', HIDEOUT)); // sai: 4 min
    t.feed(lv('20.10.00', MAP)); // entra de novo
    expect(t.inMap).toBe(true);
    expect(t.elapsedMs(Date.UTC(2026, 9, 23, 20, 11, 0))).toBe(5 * 60_000);
  });
});

describe('MapTimer restore', () => {
  it('continua somando a partir do total salvo', () => {
    const t = new MapTimer();
    t.restore(90_000);
    expect(t.elapsedMs()).toBe(90_000);
    t.feed(lv('20.01.00', MAP));
    t.feed(lv('20.02.00', HIDEOUT));
    expect(t.elapsedMs()).toBe(150_000);
  });
});
