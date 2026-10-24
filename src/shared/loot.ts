// Conta os drops do Blacksail a partir das linhas ItemChange@/BagMgr@ do UE_game.log.
// Drop = quantidade nova do slot − quantidade anterior, só dentro de blocos PickItem(s).
import { parseLogTime, parseScreenLine } from './blacksail-log';
import { emptyCounts, itemKey, type ItemKey } from './items';

export interface LootDrop {
  id: number;
  key: ItemKey;
  qty: number;
  at: number;
  inChest: boolean;
}

const CONTEXT = /ItemChange@ ProtoName=(\w+) (start|end)/;
const CHANGE = /ItemChange@ (Add|Update) Id=(\d+)_\S* BagNum=(\d+) in PageId=(\d+) SlotId=(\d+)/;
const BAG = /BagMgr@:(?:Modfy BagItem|InitBagData) PageId = (\d+) SlotId = (\d+) ConfigBaseId = (\d+) Num = (\d+)/;
const REMOVE = /BagMgr@:RemoveBagItem PageId = (\d+) SlotId = (\d+)/;
const PICKUP = new Set(['PickItem', 'PickItems']);

// Depois que o baú abre, os itens ficam no chão; tudo que for pego nesse intervalo conta como do baú.
export const CHEST_WINDOW_MS = 60_000;

export class LootTracker {
  session = emptyCounts();
  lastChest = emptyCounts();
  // mesma contagem por ConfigBaseId (cada Ember/Fluorescent tem preço próprio)
  sessionById: Record<number, number> = {};
  lastChestById: Record<number, number> = {};
  chests = 0;
  startedAt: number | null = null;
  private slots = new Map<string, { id: number; num: number }>();
  private proto: string | null = null;
  private chestUntil = -Infinity;
  private lastLineAt = 0;

  // Lê o log que já existia só para aprender o inventário (quanto tem em cada pilha), sem contar drops.
  // Sem isso, a 1ª coleta numa pilha que já existia ("Update BagNum=2") não seria contada.
  prime(line: string): void {
    this.priming = true;
    try {
      this.feed(line);
    } finally {
      this.priming = false;
    }
  }

  private priming = false;

  feed(line: string, now?: number): LootDrop[] {
    const at = parseLogTime(line) ?? now ?? this.lastLineAt;
    this.lastLineAt = at;

    if (!this.priming && parseScreenLine(line)?.type === 'chest') {
      if (at > this.chestUntil - CHEST_WINDOW_MS + 5_000) {
        this.chests++;
        this.lastChest = emptyCounts();
        this.lastChestById = {};
      }
      this.chestUntil = at + CHEST_WINDOW_MS;
      return [];
    }

    let m = CONTEXT.exec(line);
    if (m) {
      this.proto = m[2] === 'start' ? m[1] : null;
      return [];
    }

    m = CHANGE.exec(line);
    if (m) {
      const [, kind, idS, numS, page, slot] = m;
      const id = Number(idS);
      const num = Number(numS);
      const key = `${page}:${slot}`;
      const prev = this.slots.get(key);
      this.slots.set(key, { id, num });
      if (this.priming || !this.proto || !PICKUP.has(this.proto)) return [];
      const item = itemKey(id);
      if (!item) return [];
      let qty: number | null = null;
      if (kind === 'Add') qty = num;
      else if (prev && prev.id === id) qty = num - prev.num;
      if (qty === null || qty <= 0) return [];
      const inChest = at <= this.chestUntil;
      this.session[item] += qty;
      this.sessionById[id] = (this.sessionById[id] ?? 0) + qty;
      if (inChest) {
        this.lastChest[item] += qty;
        this.lastChestById[id] = (this.lastChestById[id] ?? 0) + qty;
      }
      this.startedAt ??= at;
      return [{ id, key: item, qty, at, inChest }];
    }

    m = BAG.exec(line);
    if (m) {
      this.slots.set(`${m[1]}:${m[2]}`, { id: Number(m[3]), num: Number(m[4]) });
      return [];
    }

    m = REMOVE.exec(line);
    if (m) this.slots.delete(`${m[1]}:${m[2]}`);
    return [];
  }

  reset(): void {
    this.session = emptyCounts();
    this.lastChest = emptyCounts();
    this.sessionById = {};
    this.lastChestById = {};
    this.chests = 0;
    this.startedAt = null;
  }

  // Sessão salva em disco para sobreviver a fechar/abrir o app (só o "Zerar" recomeça).
  snapshot(): LootSnapshot {
    return {
      session: { ...this.session },
      lastChest: { ...this.lastChest },
      sessionById: { ...this.sessionById },
      lastChestById: { ...this.lastChestById },
      chests: this.chests,
      startedAt: this.startedAt,
    };
  }

  restore(s: Partial<LootSnapshot>): void {
    this.session = { ...emptyCounts(), ...s.session };
    this.lastChest = { ...emptyCounts(), ...s.lastChest };
    this.sessionById = { ...s.sessionById };
    this.lastChestById = { ...s.lastChestById };
    this.chests = s.chests ?? 0;
    this.startedAt = s.startedAt ?? null;
  }
}

export interface LootSnapshot {
  session: Record<ItemKey, number>;
  lastChest: Record<ItemKey, number>;
  sessionById: Record<number, number>;
  lastChestById: Record<number, number>;
  chests: number;
  startedAt: number | null;
}
