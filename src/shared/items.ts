// ConfigBaseId dos itens do Blacksail (SS14, confirmados no tlidb e no UE_game.log).
// Além de Scrap/Thread/Invitation, o Void Sea Treasure também solta Embers, Fluorescent Memories
// (记忆荧光), Netherrealm Resonance e FE — medidos nos baús reais do usuário.
export type ItemKey =
  | 'scrap'
  | 'threadMagic'
  | 'threadRare'
  | 'threadEpic'
  | 'invCraving'
  | 'invEcstasy'
  | 'invSorrow'
  | 'heroMemory'
  | 'ember'
  | 'fluorescent'
  | 'resonance'
  | 'fe';

export interface ItemInfo {
  key: ItemKey;
  name: string;
}

const FLUORESCENT_IDS = [
  6002, 6003, 6004, 6006, 6007, 6008, 6019, 6026, 6027, 6054, 6055, 6111, 6118, 6119, 6125, 6127, 6135, 6139, 6141, 6143, 6147,
  6148, 6153, 6216, 6217, 6218, 6219, 6221, 6222, 6223,
];

export const ITEMS: Record<number, ItemInfo> = {
  5140: { key: 'scrap', name: 'Memory Scrap' },
  5142: { key: 'threadMagic', name: 'Memory Thread (Magic)' },
  5143: { key: 'threadRare', name: 'Memory Thread (Rare)' },
  5144: { key: 'threadEpic', name: 'Memory Thread (Epic)' },
  410201: { key: 'invCraving', name: 'Void Sea Invitation (Craving)' },
  410202: { key: 'invEcstasy', name: 'Void Sea Invitation (Ecstasy)' },
  410203: { key: 'invSorrow', name: 'Void Sea Invitation (Sorrow)' },
  71001: { key: 'heroMemory', name: 'Hero Memory' },
  71002: { key: 'heroMemory', name: 'Hero Memory' },
  71003: { key: 'heroMemory', name: 'Hero Memory' },
  200003: { key: 'ember', name: 'Fine Ember' },
  200028: { key: 'ember', name: 'Precious Ember' },
  200029: { key: 'ember', name: 'Matchless Ember' },
  200030: { key: 'ember', name: 'Ultimate Ember' },
  5028: { key: 'resonance', name: 'Netherrealm Resonance' },
  100300: { key: 'fe', name: 'Flame Elementium' },
  ...Object.fromEntries(FLUORESCENT_IDS.map((id) => [id, { key: 'fluorescent' as const, name: 'Fluorescent Memory' }])),
};

export const ID_BY_KEY: Partial<Record<ItemKey, number>> = {
  scrap: 5140,
  threadMagic: 5142,
  threadRare: 5143,
  threadEpic: 5144,
  invCraving: 410201,
  invEcstasy: 410202,
  invSorrow: 410203,
};

// Buscados sempre no TITrack. Os demais (Embers, Fluorescent...) são buscados quando caem.
// Hero Memory fica de fora: o preço depende dos afixos. FE vale 1.
export const PRICE_IDS: number[] = Object.values(ID_BY_KEY) as number[];
export const FE_ID = 100300;

export const ITEM_KEYS: ItemKey[] = [
  'scrap',
  'threadMagic',
  'threadRare',
  'threadEpic',
  'invCraving',
  'invEcstasy',
  'invSorrow',
  'heroMemory',
  'ember',
  'fluorescent',
  'resonance',
  'fe',
];

export const LABELS: Record<ItemKey, string> = {
  scrap: 'Memory Scrap',
  threadMagic: 'Thread Magic',
  threadRare: 'Thread Rare',
  threadEpic: 'Thread Epic',
  invCraving: 'Invitation Craving',
  invEcstasy: 'Invitation Ecstasy',
  invSorrow: 'Invitation Sorrow',
  heroMemory: 'Hero Memory',
  ember: 'Embers',
  fluorescent: 'Fluorescent Memory',
  resonance: 'Netherrealm Resonance',
  fe: 'FE (direto)',
};

export function itemKey(id: number): ItemKey | null {
  return ITEMS[id]?.key ?? null;
}

export function emptyCounts(): Record<ItemKey, number> {
  return Object.fromEntries(ITEM_KEYS.map((k) => [k, 0])) as Record<ItemKey, number>;
}
