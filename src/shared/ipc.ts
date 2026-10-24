import type { Goal } from './goals';
import type { ItemKey } from './items';
import type { BBox, Quality } from './layout';
import type { AffixItem, WhisperType } from './whisper-parser';

export interface OverlayCard {
  key: string;
  type: WhisperType;
  quality: Quality;
  titleBox: BBox;
  bbox: BBox;
  totalFE: number;
  guaranteedFE: number;
  chanceFE: number;
  jackpotFE: number;
  goalText: string; // pontuação no objetivo escolhido, já formatada
  parts: Record<AffixItem, number>;
  estimated: boolean;
  missingPrices: boolean;
  lowConfidence: boolean;
  affixes: string[];
  unknown: string[];
  visible: boolean; // está no frame mais recente (dá para desenhar por cima)
}

export interface OverlayFlame {
  key: string;
  label: string;
  raw: string;
  valueFE: number;
  goalText: string;
  quality: Quality;
  current: boolean;
  pos?: { x: number; y: number; size: number };
}

export interface OverlayRound {
  picks: number; // escolhas já feitas nesta rodada (de 6)
  summary: string[]; // cartas escolhidas
  scrapExtra: number; // Scraps extras esperados já garantidos
  scrapMult: number; // soma dos ×2/×3 de Scrap
  guaranteedFE: number; // piso: baú base + afixos garantidos das cartas escolhidas
  expectedFE: number; // média: piso + média das chances
  jackpotFE: number; // se todas as chances acertarem
}

export interface OverlayState {
  mode: 'cards' | 'flames';
  goal: Goal; // objetivo efetivo (cai para FE se nada ajuda o escolhido)
  goalLabel: string;
  flames: OverlayFlame[];
  bestFlameKey: string | null;
  round: OverlayRound;
  show: boolean;
  status: 'idle' | 'reading' | 'ready' | 'error';
  message?: string;
  frameW: number;
  frameH: number;
  cards: OverlayCard[];
  bestKey: string | null;
  routesLeft: number | null;
}

export interface PanelItemRow {
  key: ItemKey;
  label: string;
  qty: number;
  fe: number | null;
}

export interface PanelState {
  logPath: string | null;
  logActive: boolean;
  gameFound: boolean;
  pricesAt: number | null;
  pricesError: string | null;
  prices: { key: ItemKey; label: string; fe: number }[];
  rows: PanelItemRow[];
  totalFE: number;
  perHour: number | null;
  mapTimeMs: number;
  inMap: boolean;
  goal: Goal;
  round: OverlayRound; // rodada atual (6 cartas até o baú)
  chests: number;
  lastChestFE: number;
  scrapFE: number;
  threadFE: number;
  routesLeft: number | null;
  overlayVisible: boolean;
  notice?: string;
}

export const CHANNELS = {
  overlay: 'overlay:update',
  panel: 'panel:update',
  reset: 'panel:reset',
  analyze: 'panel:analyze',
  calibrate: 'panel:calibrate',
  openCalibration: 'panel:open-calibration',
  toggleOverlay: 'panel:toggle-overlay',
  quit: 'panel:quit',
  goal: 'panel:goal',
  resize: 'panel:resize',
  overlayMouse: 'overlay:mouse',
} as const;

export const CAPTURE_CHANNELS = {
  request: 'capture:request',
  result: 'capture:result',
} as const;
