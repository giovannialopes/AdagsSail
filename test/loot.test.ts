import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LootTracker } from '../src/shared/loot';

const lines = readFileSync(new URL('./fixtures/loot.log', import.meta.url), 'utf8').split(/\r?\n/);
const P = '[2026.10.23-17.00.00:000][  1]TLLua: Display: [Game] ';

describe('LootTracker (log real SS14)', () => {
  it('counts Blacksail chest drops by slot delta', () => {
    const t = new LootTracker();
    const drops = lines.flatMap((l) => t.feed(l));
    expect(drops.map((d) => [d.key, d.qty])).toEqual([
      ['scrap', 227],
      ['threadEpic', 6],
      ['threadEpic', 1],
      ['threadEpic', 1],
      ['heroMemory', 1],
    ]);
    expect(drops.every((d) => d.inChest)).toBe(true);
    expect(t.session.scrap).toBe(227);
    expect(t.session.threadEpic).toBe(8);
    expect(t.chests).toBe(1);
    expect(t.lastChest.scrap).toBe(227);
  });

  it('does not count an Update when the previous slot state is unknown', () => {
    const t = new LootTracker();
    const drops = [
      `${P}ItemChange@ ProtoName=PickItems start`,
      `${P}ItemChange@ Update Id=5140_abc BagNum=50 in PageId=102 SlotId=3`,
      `${P}BagMgr@:Modfy BagItem PageId = 102 SlotId = 3 ConfigBaseId = 5140 Num = 50`,
      `${P}ItemChange@ ProtoName=PickItems end`,
      `${P}ItemChange@ ProtoName=PickItems start`,
      `${P}ItemChange@ Update Id=5140_abc BagNum=58 in PageId=102 SlotId=3`,
      `${P}ItemChange@ ProtoName=PickItems end`,
    ].flatMap((l) => t.feed(l));
    expect(drops.map((d) => d.qty)).toEqual([8]);
    expect(drops[0].inChest).toBe(false);
  });

  it('ignores non-pickup inventory changes and slot removal resets state', () => {
    const t = new LootTracker();
    const drops = [
      `${P}BagMgr@:InitBagData PageId = 102 SlotId = 3 ConfigBaseId = 5140 Num = 10`,
      `${P}ItemChange@ ProtoName=XchgForSale start`,
      `${P}ItemChange@ Update Id=5140_abc BagNum=2 in PageId=102 SlotId=3`,
      `${P}ItemChange@ ProtoName=XchgForSale end`,
      `${P}BagMgr@:RemoveBagItem PageId = 102 SlotId = 3`,
      `${P}ItemChange@ ProtoName=PickItem start`,
      `${P}ItemChange@ Add Id=5142_x BagNum=4 in PageId=102 SlotId=3`,
      `${P}ItemChange@ ProtoName=PickItem end`,
    ].flatMap((l) => t.feed(l));
    expect(drops.map((d) => [d.key, d.qty])).toEqual([['threadMagic', 4]]);
  });

  it('reset clears session totals but keeps slot state', () => {
    const t = new LootTracker();
    lines.forEach((l) => t.feed(l));
    t.reset();
    expect(t.session.scrap).toBe(0);
    expect(t.chests).toBe(0);
  });
});

describe('LootTracker snapshot/restore', () => {
  it('a sessão volta igual depois de fechar e abrir', () => {
    const a = new LootTracker();
    lines.forEach((l) => a.feed(l));
    const b = new LootTracker();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.session).toEqual(a.session);
    expect(b.sessionById).toEqual(a.sessionById);
    expect(b.chests).toBe(1);
  });
});

describe('LootTracker.prime', () => {
  it('aprende o inventário do log antigo e conta a 1ª coleta numa pilha que já existia', () => {
    const t = new LootTracker();
    // antes do app abrir: já tinha 1 Invitation na pilha (e uma coleta antiga, que não deve contar)
    t.prime(`${P}ItemChange@ ProtoName=PickItems start`);
    t.prime(`${P}ItemChange@ Add Id=410201_x BagNum=1 in PageId=103 SlotId=7`);
    t.prime(`${P}ItemChange@ ProtoName=PickItems end`);
    expect(t.session.invCraving).toBe(0);
    // depois: pegou mais 1 → pilha 2
    const drops = [
      `${P}ItemChange@ ProtoName=PickItems start`,
      `${P}ItemChange@ Update Id=410201_x BagNum=2 in PageId=103 SlotId=7`,
      `${P}ItemChange@ ProtoName=PickItems end`,
    ].flatMap((l) => t.feed(l));
    expect(drops.map((d) => [d.key, d.qty])).toEqual([['invCraving', 1]]);
  });
});
