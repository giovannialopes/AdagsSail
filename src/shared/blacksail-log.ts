// Eventos da tela de escolha de Seal Whisper, lidos do UE_game.log (formato confirmado na SS14).

export type ScreenEvent =
  | { type: 'open' }
  | { type: 'click' }
  | { type: 'picked'; rarity: number }
  | { type: 'confirm' }
  | { type: 'close' }
  | { type: 'routes'; selected: number; left: number }
  | { type: 'chest' }
  | { type: 'sealOpen' }
  | { type: 'flameClick' }
  | { type: 'sealConfirm' }
  | { type: 'sealClose' };

const OPEN = /LoadSubLevelFromCfg END! InSubLevelPath = \S*\/S2\/XuKongHaiTu\//;
const CLOSE = /UnLoadSubLevelFromCfg END! SubLevelName = \S*\/S2\/XuKongHaiTu\//;
const CLICK = /AudioEnum\s+==\s+S2_System_Card_Click\b/;
const CONFIRM = /AudioEnum\s+==\s+S2_System_Card_Confirm\b/;
const PICKED = /requested row 'VoidAltarCoord_Rarity(\d)SelectedBtn'/;
const ROUTES = /SeasonAltar ReceiveServerData SelectedRoutes-Num:\[(\d+)\].*?LeftRouteTimes:(\d+)/;
const CHEST = /'Play_Obj_BlackSail_Chest_Open' requested row/;
// Tela "Void Sea Seal" (colocar as Void Sea Flames)
const SEAL_OPEN = /\[Game\] VoidBeacon Run\b/;
const SEAL_CLOSE = /\[Game\] VoidBeacon Destory\b/;
const FLAME_CLICK = /AudioEnum\s+==\s+S2_System_Fire_Click\b/;
const SEAL_CONFIRM = /requested row 'VoidBeacon_C_BtnConfirm'/;

export function parseScreenLine(line: string): ScreenEvent | null {
  if (CLOSE.test(line)) return { type: 'close' };
  if (OPEN.test(line)) return { type: 'open' };
  if (CLICK.test(line)) return { type: 'click' };
  if (CONFIRM.test(line)) return { type: 'confirm' };
  let m = PICKED.exec(line);
  if (m) return { type: 'picked', rarity: Number(m[1]) };
  m = ROUTES.exec(line);
  if (m) return { type: 'routes', selected: Number(m[1]), left: Number(m[2]) };
  if (CHEST.test(line)) return { type: 'chest' };
  if (SEAL_OPEN.test(line)) return { type: 'sealOpen' };
  if (SEAL_CLOSE.test(line)) return { type: 'sealClose' };
  if (FLAME_CLICK.test(line)) return { type: 'flameClick' };
  if (SEAL_CONFIRM.test(line)) return { type: 'sealConfirm' };
  return null;
}

const TIME = /^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/;

// Horário do log como epoch "UTC ingênuo": só usamos diferenças entre linhas.
export function parseLogTime(line: string): number | null {
  const m = TIME.exec(line);
  if (!m) return null;
  const [y, mo, d, h, mi, s, ms] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s, ms);
}
