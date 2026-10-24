import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLogTime, parseScreenLine } from '../src/shared/blacksail-log';

const lines = readFileSync(new URL('./fixtures/blacksail-screen.log', import.meta.url), 'utf8').split(/\r?\n/);

describe('parseScreenLine (log real SS14)', () => {
  it('produces the choice-screen sequence', () => {
    const events = lines.map((l) => parseScreenLine(l)).filter(Boolean);
    expect(events).toEqual([
      { type: 'routes', selected: 2, left: 4 },
      { type: 'open' },
      { type: 'click' },
      { type: 'click' },
      { type: 'picked', rarity: 2 },
      { type: 'confirm' },
      { type: 'close' },
      { type: 'routes', selected: 3, left: 3 },
    ]);
  });

  it('detects the Blacksail chest opening', () => {
    const l = "[2026.10.23-16.30.57:298][929]LogDataTable: Warning: UDataTable::FindRow : 'Play_Obj_BlackSail_Chest_Open' requested row 'Play_Obj_BlackSail_Chest_Open' not in DataTable";
    expect(parseScreenLine(l)).toEqual({ type: 'chest' });
  });

  it('ignores unrelated lines', () => {
    expect(parseScreenLine('[2026.10.23-16.28.55:153][355]TLLua: Display: [Game] SkillMgr@:GetSkillUpState')).toBeNull();
  });
});

describe('parseLogTime', () => {
  it('reads the bracketed timestamp', () => {
    const t = parseLogTime('[2026.10.23-16.29.05:297][703]TLLua: x');
    expect(t).toBe(Date.UTC(2026, 9, 23, 16, 29, 5, 297));
    expect(parseLogTime('no stamp')).toBeNull();
  });
});

describe('tela Void Sea Seal (Flames) — log real SS14', () => {
  const seal = readFileSync(new URL('./fixtures/seal-screen.log', import.meta.url), 'utf8').split(/\r?\n/);
  it('abre, registra cliques nas Flames, confirma e fecha', () => {
    const types = seal.map((l) => parseScreenLine(l)?.type).filter(Boolean);
    expect(types[0]).toBe('sealOpen');
    expect(types.filter((t) => t === 'flameClick').length).toBeGreaterThan(0);
    expect(types).toContain('sealConfirm');
    expect(types.at(-1)).toBe('sealClose');
  });
});
