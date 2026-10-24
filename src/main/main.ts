import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseScreenLine } from '../shared/blacksail-log';
import { CHANNELS, type OverlayState, type PanelState } from '../shared/ipc';
import { FE_ID, ID_BY_KEY, ITEM_KEYS, LABELS, itemKey, type ItemKey } from '../shared/items';
import type { CardRead, OcrLine } from '../shared/layout';
import { LootTracker } from '../shared/loot';
import { formatGoal, GOAL_LABEL, GOALS, type Goal } from '../shared/goals';
import { MapTimer } from '../shared/maptime';
import { Round } from '../shared/round';
import { baseChestFE } from '../shared/valuation';
import { parseFlame } from '../shared/flames';
import { SealSession } from '../shared/seal';
import { ChoiceSession } from '../shared/session';
import { saveCalibration } from './calibration';
import { calibrateSeal, calibrateTerminal, clientRegion, readSealText, scanChoice, sealQuick } from './analyzer';
import { uiUnit } from '../shared/uiscale';
import { SAME_TEXT, signatureDiff } from '../shared/signature';
import { History } from './history';
import { captureGame, initCapture, type Frame } from './capture';
import { cursorPos, findGameWindow, type GameWindow } from './game-window';
import { findLogPath } from './log-path';
import { LogTail } from './log-tail';
import { stopOcr } from './ocr';
import { PriceService } from './prices';
import { loadSettings, saveSettings, type Settings } from './settings';

function logError(err: unknown): void {
  try {
    const { appendFileSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(app.getPath('userData'), { recursive: true });
      appendFileSync(join(app.getPath('userData'), 'error.log'), `[${new Date().toISOString()}] ${(err as Error)?.stack ?? err}\n`);
  } catch {
    // sem onde registrar
  }
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);

// Desenvolvimento: pasta de dados separada (permite testar com o app do usuário aberto).
if (process.env.ADAGS_USERDATA) app.setPath('userData', process.env.ADAGS_USERDATA);

if (!app.requestSingleInstanceLock()) app.quit();

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const userDir = () => app.getPath('userData');
const settingsFile = () => join(userDir(), 'settings.json');
const calibrationDir = () => join(userDir(), 'calibration');

let settings: Settings;
let prices: PriceService;
let tail: LogTail | null = null;
let logPath: string | null = null;
const loot = new LootTracker();
const mapTimer = new MapTimer();

let overlay: BrowserWindow;
let panel: BrowserWindow;
let overlayVisible = true;
let game: GameWindow | null = null;

let session: ChoiceSession | null = null;
let sessionFromLog = false;
let visibleKeys = new Set<string>();
let routesLeft: number | null = null;
let lastFrame: Frame | null = null;
let lastLines: OcrLine[] = [];
let lastReads: CardRead[] = [];
let overlayStatus: OverlayState['status'] = 'idle';
let overlayMessage: string | undefined;
let manualTimer: NodeJS.Timeout | null = null;

let seal: SealSession | null = null;
const round = new Round();
let history: History;
let choiceFrame: string | undefined; // print salvo da tela de cartas atual

// ---------- janelas ----------

function createWindows(): void {
  const preload = join(__dirname, 'preload.js');
  overlay = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(join(__dirname, 'renderer', 'overlay.html'));

  const pos = settings.panelBounds ?? { x: 24, y: 160 };
  panel = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: 320,
    height: 470,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'AdagsSail',
    icon: join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload, backgroundThrottling: false },
  });
  panel.setAlwaysOnTop(true, 'screen-saver');
  panel.loadFile(join(__dirname, 'renderer', 'panel.html'));
  panel.on('moved', () => {
    const [x, y] = panel.getPosition();
    settings.panelBounds = { x, y };
    saveSettings(settingsFile(), settings);
  });
  panel.on('closed', () => app.quit());
}

function placeOverlay(): void {
  game = findGameWindow();
  if (!game || game.minimized || !overlayVisible) {
    if (overlay.isVisible()) overlay.hide();
    return;
  }
  const dip = screen.screenToDipRect(null, game.rect);
  const b = overlay.getBounds();
  if (b.x !== dip.x || b.y !== dip.y || b.width !== dip.width || b.height !== dip.height) overlay.setBounds(dip);
  if (!overlay.isVisible()) overlay.showInactive();
}

// ---------- estado → renderers ----------

function roundState(): OverlayState['round'] {
  const ctx = round.context(settings.baseline);
  const TYPE: Record<string, string> = { wealth: 'Wealth', wonder: 'Wonder', armament: 'Armament', boss: 'Boss', unknown: '?' };
  const base = baseChestFE(prices.get(), settings.baseline);
  const val = (k: 'guaranteedFE' | 'chanceFE' | 'jackpotFE') => round.picks.reduce((s, p) => s + (p.card?.value[k] ?? 0), 0);
  return {
    picks: round.picks.length,
    summary: round.picks.map((p) => (p.card ? `${TYPE[p.card.type]}: ${p.card.affixes.map((a) => a.raw).join(' ') || p.card.lines.join(' ')}` : `raridade ${p.rarity} (não lida)`)),
    scrapExtra: ctx.extra.scrap,
    scrapMult: ctx.mult.scrap,
    guaranteedFE: base + val('guaranteedFE'),
    expectedFE: base + val('guaranteedFE') + val('chanceFE'),
    jackpotFE: base + val('jackpotFE'),
  };
}

function overlayState(): OverlayState {
  const cards = session?.ranked() ?? [];
  const flames = seal?.ranked() ?? [];
  const mode: OverlayState['mode'] = seal ? 'flames' : 'cards';
  const goal: Goal = seal ? seal.effectiveGoal() : (session?.effectiveGoal() ?? settings.goal);
  return {
    mode,
    goal,
    goalLabel: GOAL_LABEL[goal],
    flames: flames.map((f) => ({ key: f.key, label: f.label, raw: f.flame.raw, valueFE: f.valueFE, goalText: formatGoal(goal, f.values[goal]), quality: f.quality, current: f.key === seal?.current, pos: f.pos })),
    bestFlameKey: seal?.bestKey() ?? null,
    round: roundState(),
    show: overlayVisible && (cards.length > 0 || flames.length > 0 || overlayStatus !== 'idle'),
    status: overlayStatus,
    message: overlayMessage,
    frameW: lastFrame?.width ?? 1,
    frameH: lastFrame?.height ?? 1,
    bestKey: session?.bestKey() ?? null,
    routesLeft,
    cards: cards.map((c) => ({
      key: c.key,
      type: c.type,
      quality: c.quality,
      titleBox: c.titleBox,
      bbox: c.bbox,
      totalFE: c.value.totalFE,
      guaranteedFE: c.value.guaranteedFE,
      chanceFE: c.value.chanceFE,
      jackpotFE: c.value.jackpotFE,
      goalText: formatGoal(goal, c.scores[goal]),
      parts: c.value.parts,
      estimated: c.value.estimated,
      missingPrices: c.value.missingPrices,
      lowConfidence: c.lowConfidence,
      affixes: c.affixes.map((a) => a.raw),
      unknown: c.unknown,
      visible: visibleKeys.has(c.key),
    })),
  };
}

function sendOverlay(): void {
  if (!overlay.isDestroyed()) overlay.webContents.send(CHANNELS.overlay, overlayState());
}

function unitPrice(key: ItemKey): number | null {
  if (key === 'heroMemory') return settings.baseline.heroMemoryFE;
  const id = ID_BY_KEY[key];
  return id !== undefined ? (prices.get()[id]?.fe ?? null) : null;
}

// Preço por ConfigBaseId (cada Ember/Fluorescent tem o seu). FE vale 1; Hero Memory usa o valor fixo.
function idPrice(id: number): number | null {
  if (id === FE_ID) return 1;
  if (itemKey(id) === 'heroMemory') return settings.baseline.heroMemoryFE;
  return prices.get()[id]?.fe ?? null;
}

function feById(counts: Record<number, number>, key?: ItemKey): number | null {
  let total = 0;
  let priced = false;
  for (const [idS, qty] of Object.entries(counts)) {
    const id = Number(idS);
    if (key && itemKey(id) !== key) continue;
    const price = idPrice(id);
    if (price === null) continue;
    total += qty * price;
    priced = true;
  }
  return priced || !key ? total : null;
}

function panelState(): PanelState {
  const p = prices.get();
  const rows = ITEM_KEYS.map((key) => {
    const qty = loot.session[key];
    return { key, label: LABELS[key], qty, fe: qty ? feById(loot.sessionById, key) : 0 };
  });
  const totalFE = rows.reduce((a, r) => a + (r.fe ?? 0), 0);
  const lastChestFE = feById(loot.lastChestById) ?? 0;
  const fe = (k: ItemKey) => rows.find((r) => r.key === k)?.fe ?? 0;
  // FE/h pelo tempo em mapa (o relógio contaria o tempo em que o app ficou fechado)
  const mapH = mapTimer.elapsedMs() / 3_600_000;
  const elapsedH = mapH > 0.02 ? mapH : loot.startedAt === null ? 0 : (Date.now() - sessionStartWall) / 3_600_000;
  const fetched = Object.values(p).map((e) => e.fetchedAt);
  return {
    logPath,
    logActive: !!tail && Date.now() - tail.lastChangeAt < 60_000,
    gameFound: !!game,
    pricesAt: fetched.length ? Math.max(...fetched) : null,
    pricesError: prices.lastError,
    prices: ITEM_KEYS.filter((k) => k !== 'heroMemory' && unitPrice(k) !== null).map((k) => ({
      key: k,
      label: LABELS[k],
      fe: unitPrice(k) as number,
    })),
    rows,
    totalFE,
    perHour: elapsedH > 0.02 ? totalFE / elapsedH : null,
    mapTimeMs: mapTimer.elapsedMs(),
    inMap: mapTimer.inMap,
    goal: settings.goal,
    round: roundState(),
    chests: loot.chests,
    lastChestFE,
    scrapFE: fe('scrap'),
    threadFE: fe('threadMagic') + fe('threadRare') + fe('threadEpic'),
    routesLeft,
    overlayVisible,
    notice: logPath
      ? undefined
      : 'UE_game.log não encontrado. No jogo: Esc → Settings → Other → Enable Log. Ou defina "logPath" em settings.json.',
  };
}

let sessionStartWall = Date.now();

function sendPanel(): void {
  if (!panel.isDestroyed()) panel.webContents.send(CHANNELS.panel, panelState());
}

// ---------- análise das cartas ----------

let busy = false;
let again = false;

// Número da tela atual: muda ao abrir/fechar. Uma leitura que termina depois de a tela fechar é descartada
// (senão o círculo e as etiquetas ficariam presos no mapa).
let screenToken = 0;
let emptyReads = 0;

async function analyzeOnce(): Promise<void> {
  const token = screenToken;
  const g = findGameWindow();
  if (!g || g.minimized) {
    overlayStatus = 'error';
    overlayMessage = 'Janela do Torchlight: Infinite não encontrada';
    return;
  }
  overlayStatus = 'reading';
  overlayMessage = undefined;
  sendOverlay();
  const frame = await captureGame(g);
  if (!frame) {
    overlayStatus = 'error';
    overlayMessage = 'Não consegui capturar a janela do jogo';
    return;
  }
  const client = clientRegion(frame, g);
  let scan = await scanChoice(frame, g, unitFor('terminal', client));
  if (token !== screenToken || !session) return; // a tela fechou enquanto lia
  // layout fixo não achou as cartas: pode ser escala da interface diferente — mede e relê
  if (scan.layout !== 'terminal' && !settings.uiUnits?.[`${client.width}x${client.height}`]?.terminal) {
    const unit = await calibrateTerminal(frame, client);
    if (unit) {
      saveUnit('terminal', client, unit);
      scan = await scanChoice(frame, g, unit);
    }
    if (token !== screenToken || !session) return;
  }
  lastFrame = frame;
  lastLines = scan.lines;
  lastReads = scan.reads;
  // sem cartas em 2 leituras seguidas = não está mais na tela de escolha: some com as marcas
  emptyReads = scan.reads.length ? 0 : emptyReads + 1;
  if (emptyReads >= 2) {
    visibleKeys.clear();
    // ~5 s sem cartas: a tela fechou sem o log avisar — encerra a leitura contínua
    if (emptyReads >= 8) closeSession();
    return;
  }
  visibleKeys = new Set(session.add(lastReads, prices.get(), settings.baseline, round.context(settings.baseline)));
  // guarda 1 print por tela de cartas (o primeiro com as 3 lidas) para o histórico
  if (sessionFromLog && !choiceFrame && lastReads.length >= 3) choiceFrame = history.saveFrame(frame.image, 'cartas');
  overlayStatus = lastReads.length ? 'ready' : 'idle';
  overlayMessage = lastReads.length ? undefined : 'Nenhuma carta de Seal Whisper encontrada na tela';
}

async function analyze(): Promise<void> {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    do {
      again = false;
      await analyzeOnce();
      sendOverlay();
    } while (again);
  } catch (err) {
    overlayStatus = 'error';
    overlayMessage = `Erro na leitura: ${(err as Error).message}`;
    sendOverlay();
  } finally {
    busy = false;
  }
}

function scheduleAnalyze(): void {
  setTimeout(() => void analyze(), settings.captureDelayMs);
}

// Enquanto a tela de escolha estiver aberta, relê a cada ~0,6 s (animação de entrada, botão Switch).
let loopToken = 0;
function startLoop(): void {
  const token = ++loopToken;
  const tick = async () => {
    if (token !== loopToken || !sessionFromLog) return;
    await analyze();
    setTimeout(() => void tick(), 600);
  };
  setTimeout(() => void tick(), settings.captureDelayMs);
}

function analyzeManually(): void {
  if (!sessionFromLog) {
    session = new ChoiceSession(settings.goal);
    if (manualTimer) clearTimeout(manualTimer);
    manualTimer = setTimeout(() => {
      if (!sessionFromLog) closeSession();
    }, 30_000);
  }
  void analyze();
}

// ---------- tela das Flames (Void Sea Seal) ----------

let sealBusy = false;
let sealAgain = false;
let sealFrameSaved = false;
// último clique numa Flame (cursor em pixels de tela): a Flame clicada é o ícone mais perto dele
let lastFlameClick: { x: number; y: number; at: number } | null = null;
// texto já lido de cada Flame (pela assinatura da imagem): clicar de novo não precisa de OCR
let flameTextCache: { sig: number[]; text: string }[] = [];

// Unidade de interface para este tamanho de janela: medida (calibrada) ou estimada pela proporção.
function unitFor(kind: 'seal' | 'terminal', client: { width: number; height: number; x: number; y: number }): number {
  return settings.uiUnits?.[`${client.width}x${client.height}`]?.[kind] ?? uiUnit(client);
}

function saveUnit(kind: 'seal' | 'terminal', client: { width: number; height: number }, unit: number): void {
  const key = `${client.width}x${client.height}`;
  settings.uiUnits = { ...settings.uiUnits, [key]: { ...settings.uiUnits?.[key], [kind]: Math.round(unit) } };
  saveSettings(settingsFile(), settings);
  logError(`[info] escala da interface (${kind}) para ${key}: U=${Math.round(unit)}`);
}

async function analyzeSealOnce(): Promise<void> {
  const token = screenToken;
  const g = findGameWindow();
  if (!g || g.minimized || !seal) return;
  // Logo após o clique o destaque e o texto não mudam juntos: espera a tela parar comparando duas
  // capturas seguidas pela assinatura (barata, sem OCR). Depois, OCR só se o texto for novo (cache).
  let prev: ReturnType<typeof sealQuick> | null = null;
  let frame: Frame | null = null;
  let quick: ReturnType<typeof sealQuick> | null = null;
  let client = null as ReturnType<typeof clientRegion> | null;
  for (let attempt = 0; attempt < 10; attempt++) {
    frame = await captureGame(g);
    if (!frame || !seal) return;
    client = clientRegion(frame, g);
    // clique recente → posição do cursor convertida para pixels do frame
    const click =
      lastFlameClick && Date.now() - lastFlameClick.at < 3000
        ? { x: ((lastFlameClick.x - g.rect.x) * frame.width) / g.rect.width, y: ((lastFlameClick.y - g.rect.y) * frame.height) / g.rect.height }
        : undefined;
    quick = sealQuick(frame, client, unitFor('seal', client), click);
    const samePos = !!prev && (!prev.pos || !quick.pos ? prev.pos === quick.pos : Math.hypot(prev.pos.x - quick.pos.x, prev.pos.y - quick.pos.y) < 20);
    if (prev && samePos && signatureDiff(prev.sig, quick.sig) < SAME_TEXT) break;
    prev = quick;
    await new Promise((r) => setTimeout(r, 40));
  }
  if (!frame || !quick || !client || !seal || token !== screenToken) return;
  lastFrame = frame;
  const cached = flameTextCache.find((c) => signatureDiff(c.sig, quick!.sig) < SAME_TEXT);
  let text = cached?.text ?? (await readSealText(frame, client, unitFor('seal', client)));
  if (token !== screenToken || !seal) return; // fechou enquanto lia
  // Não leu Flame nenhuma? Pode ser escala da interface diferente: mede pelo botão "Confirm" e relê.
  if (!parseFlame(text) && !settings.uiUnits?.[`${client.width}x${client.height}`]?.seal) {
    const unit = await calibrateSeal(frame, client);
    if (unit) {
      saveUnit('seal', client, unit);
      text = await readSealText(frame, client, unit);
      quick = sealQuick(frame, client, unit);
    }
    if (token !== screenToken || !seal) return;
  }
  if (!cached && parseFlame(text)) flameTextCache.push({ sig: quick.sig, text });
  const seen = seal.add(text, quick.quality, prices.get(), settings.baseline, quick.pos ?? undefined);
  overlayStatus = 'ready';
  overlayMessage = seen ? undefined : 'Clique numa Flame para o AdagsSail ler o texto';
  if (seen && !sealFrameSaved) sealFrameSaved = !!history.saveFrame(frame.image, 'flames');
}

async function analyzeSeal(): Promise<void> {
  if (sealBusy) {
    sealAgain = true;
    return;
  }
  sealBusy = true;
  try {
    do {
      sealAgain = false;
      await analyzeSealOnce();
      sendOverlay();
    } while (sealAgain);
  } catch (err) {
    logError(err);
  } finally {
    sealBusy = false;
  }
}

function recordFlames(confirmed: boolean): void {
  if (!seal || !seal.size) return;
  history.append({
    type: 'flames',
    at: new Date().toISOString(),
    flames: seal.ranked().map((f) => ({ label: f.label, raw: f.flame.raw, quality: f.quality, valueFE: f.valueFE, chosen: confirmed && f.key === seal!.current })),
  });
}

// ---------- rodada / histórico ----------

function recordPick(rarity: number): void {
  const shown = session?.ranked() ?? [];
  const res = round.pick(rarity, shown);
  history.append({
    type: 'choice',
    at: new Date().toISOString(),
    round: round.number,
    cards: shown.map((c) => ({ slot: c.slot, type: c.type, quality: c.quality, affixes: c.affixes.map((a) => a.raw), unknown: c.unknown, lines: c.lines, valueFE: c.value.totalFE })),
    picked: { rarity, key: res.card?.key ?? null },
    frame: choiceFrame,
  });
}

// Os itens do baú ficam no chão: espera a janela do baú (60 s) e grava o que foi pego.
function recordChestLater(): void {
  const picks = round.finish();
  const number = round.number - 1;
  setTimeout(() => {
    history.append({
      type: 'chest',
      at: new Date().toISOString(),
      round: number,
      drops: { ...loot.lastChest },
      dropsById: { ...loot.lastChestById },
      chestFE: feById(loot.lastChestById) ?? 0,
      picks: picks.map((p) => ({ rarity: p.rarity, type: p.card?.type, quality: p.card?.quality, affixes: p.card?.affixes.map((a) => a.raw), ambiguous: p.ambiguous })),
    });
  }, 65_000);
}

function closeSession(): void {
  loopToken++;
  screenToken++;
  emptyReads = 0;
  choiceFrame = undefined;
  session = null;
  sessionFromLog = false;
  visibleKeys.clear();
  overlayStatus = 'idle';
  overlayMessage = undefined;
  sendOverlay();
}

// ---------- log ----------

function onLogLine(line: string): void {
  mapTimer.feed(line);
  if (/SceneLevelMgr@ OpenMainWorld END!/.test(line) && (session || seal)) {
    seal = null;
    closeSession();
  }
  const drops = loot.feed(line);
  if (drops.length) {
    for (const d of drops) if (d.key !== 'heroMemory' && d.key !== 'fe') prices.want(d.id);
    sendPanel();
  }
  const ev = parseScreenLine(line);
  if (!ev) return;
  switch (ev.type) {
    case 'open':
      screenToken++;
      emptyReads = 0;
      session = new ChoiceSession(settings.goal);
      sessionFromLog = true;
      visibleKeys.clear();
      startLoop();
      break;
    case 'click':
      if (sessionFromLog) scheduleAnalyze();
      break;
    case 'picked':
      recordPick(ev.rarity);
      break;
    case 'close':
      closeSession();
      break;
    case 'routes':
      routesLeft = ev.left;
      round.syncLeft(ev.left);
      sendPanel();
      break;
    case 'chest':
      recordChestLater();
      sendPanel();
      break;
    case 'sealOpen':
      screenToken++;
      seal = new SealSession(settings.goal);
      sealFrameSaved = false;
      flameTextCache = [];
      overlayStatus = 'reading';
      setTimeout(() => void analyzeSeal(), settings.captureDelayMs);
      break;
    case 'flameClick':
      lastFlameClick = { ...cursorPos(), at: Date.now() };
      setTimeout(() => void analyzeSeal(), 60);
      break;
    case 'sealConfirm':
      recordFlames(true);
      break;
    case 'sealClose':
      screenToken++;
      if (seal && !seal.size) recordFlames(false);
      seal = null;
      overlayStatus = session ? overlayStatus : 'idle';
      overlayMessage = undefined;
      sendOverlay();
      break;
  }
}

async function primeInventory(file: string, size: number): Promise<void> {
  if (!size) return;
  const t0 = Date.now();
  const rl = createInterface({ input: createReadStream(file, { start: 0, end: size - 1 }), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (line.includes('ItemChange@') || line.includes('BagMgr@')) {
      loot.prime(line);
      n++;
    }
  }
  logError(`[info] inventário aprendido do log: ${n} linhas em ${Date.now() - t0} ms`);
}

async function connectLog(): Promise<void> {
  const found = await findLogPath(process.env.ADAGS_LOG_PATH ?? settings.logPath);
  if (!found || found === logPath) return;
  tail?.stop();
  logPath = found;
  // Antes de seguir o log, lê o que já existe só para aprender o inventário (sem contar drops):
  // senão a 1ª coleta numa pilha que já existia não seria contada (ex.: 2ª Invitation).
  const size = (() => {
    try {
      return statSync(found).size;
    } catch {
      return 0;
    }
  })();
  await primeInventory(found, size);
  tail = new LogTail(found);
  tail.on('line', onLogLine);
  tail.start(size);
  if (!process.env.ADAGS_LOG_PATH && settings.logPath !== found) {
    settings.logPath = found; // próxima abertura não precisa procurar de novo
    saveSettings(settingsFile(), settings);
  }
  sendPanel();
}

// ---------- calibração ----------

async function calibrate(): Promise<void> {
  const g = findGameWindow();
  const frame = g ? await captureGame(g) : null;
  let lines = lastLines;
  let reads = lastReads;
  if (frame) {
    const scan = await scanChoice(frame, g);
    lines = scan.lines;
    reads = scan.reads;
  }
  const dir = saveCalibration(calibrationDir(), {
    frame,
    detect: { game: g, frameSize: frame && { w: frame.width, h: frame.height, method: frame.method }, ocrLines: lines, cards: reads, session: overlayState() },
    logTail: tail ? tail.readTail(2 * 1024 * 1024) : '',
  });
  overlayStatus = 'ready';
  overlayMessage = `Calibração salva em ${dir}`;
  sendOverlay();
  setTimeout(() => {
    if (overlayMessage?.startsWith('Calibração')) {
      overlayMessage = undefined;
      if (!session) overlayStatus = 'idle';
      sendOverlay();
    }
  }, 4000);
}

// ---------- app ----------

function toggleOverlay(): void {
  overlayVisible = !overlayVisible;
  placeOverlay();
  sendOverlay();
  sendPanel();
}

function resetSession(): void {
  loot.reset();
  mapTimer.reset();
  sessionStartWall = Date.now();
  saveSession();
  sendPanel();
}

// ---------- sessão salva em disco (fechar/abrir o app não zera; só o botão Zerar) ----------

const sessionFile = () => join(userDir(), 'session.json');

function saveSession(): void {
  try {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(sessionFile(), JSON.stringify({ savedAt: Date.now(), startWall: sessionStartWall, mapMs: mapTimer.savedMs, loot: loot.snapshot() }));
  } catch (err) {
    logError(err);
  }
}

function loadSession(): void {
  try {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const data = JSON.parse(readFileSync(sessionFile(), 'utf8'));
    loot.restore(data.loot ?? {});
    mapTimer.restore(data.mapMs ?? 0);
    if (typeof data.startWall === 'number') sessionStartWall = data.startWall;
  } catch {
    // primeira vez: sessão nova
  }
}

function registerHotkeys(): void {
  const h = settings.hotkeys;
  globalShortcut.register(h.toggle, toggleOverlay);
  globalShortcut.register(h.analyze, analyzeManually);
  globalShortcut.register(h.calibrate, () => void calibrate());
  globalShortcut.register(h.reset, resetSession);
}

app.whenReady().then(async () => {
  settings = loadSettings(settingsFile());
  loadSession();
  setInterval(saveSession, 15_000);
  history = new History(userDir());
  prices = new PriceService(join(userDir(), 'prices-cache.json'));
  prices.on('update', () => {
    sendPanel();
    if (session) sendOverlay();
  });

  createWindows();
  initCapture(join(__dirname, 'preload.js'), join(__dirname, 'renderer'));
  registerHotkeys();
  // Mantém a captura "aquecida" (abrir o stream custa ~0,8 s; com ele aberto, ~30 ms por frame),
  // para a primeira leitura da tela de cartas/Flames já sair rápida.
  const warm = () => {
    const g = findGameWindow();
    if (g && !g.minimized && !busy && !sealBusy) void captureGame(g).catch(() => null);
  };
  setTimeout(warm, 3000);
  setInterval(warm, 5 * 60_000);

  ipcMain.on(CHANNELS.reset, resetSession);
  ipcMain.on(CHANNELS.analyze, analyzeManually);
  ipcMain.on(CHANNELS.calibrate, () => void calibrate());
  ipcMain.on(CHANNELS.openCalibration, () => void shell.openPath(calibrationDir()));
  ipcMain.on(CHANNELS.toggleOverlay, toggleOverlay);
  ipcMain.on(CHANNELS.quit, () => app.quit());
  // mouse sobre o quadro do overlay: aceita cliques; fora dele, o clique atravessa para o jogo
  ipcMain.on(CHANNELS.overlayMouse, (_e, inside: boolean) => {
    overlay.setIgnoreMouseEvents(!inside, { forward: true });
  });
  ipcMain.on(CHANNELS.resize, (_e, h: number) => {
    const height = Math.max(200, Math.min(900, Math.round(Number(h) || 0)));
    const [w] = panel.getSize();
    panel.setSize(w, height);
  });
  ipcMain.on(CHANNELS.goal, (_e, g: Goal) => {
    if (!GOALS.includes(g)) return;
    settings.goal = g;
    saveSettings(settingsFile(), settings);
    if (session) session.goal = g;
    if (seal) seal.goal = g;
    sendOverlay();
    sendPanel();
  });

  panel.webContents.once('did-finish-load', sendPanel);
  prices.start();
  void connectLog();
  setInterval(() => void connectLog(), 10_000);
  setInterval(() => {
    placeOverlay();
    sendPanel();
  }, 1000);
  placeOverlay();
  if (process.env.ADAGS_SNAP) void devSnapshot(process.env.ADAGS_SNAP);
});

// Só para desenvolvimento: mostra cartas de exemplo no overlay e salva prints das duas janelas.
async function devSnapshot(dir: string): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  await new Promise((r) => setTimeout(r, 6000));
  const card = (key: string, type: OverlayState['cards'][number]['type'], quality: OverlayState['cards'][number]['quality'], x: number, fe: number, parts: Partial<Record<'scrap' | 'thread' | 'hero' | 'invitation', number>>, extra: Partial<OverlayState['cards'][number]> = {}) => ({
    key, type, quality, totalFE: fe, guaranteedFE: type === 'boss' ? 0 : fe, chanceFE: type === 'boss' ? fe : 0, jackpotFE: type === 'boss' ? 18 : fe, estimated: !!extra.estimated, missingPrices: false, lowConfidence: false,
    parts: { scrap: 0, thread: 0, hero: 0, invitation: 0, ...parts },
    titleBox: { x0: x, y0: 330, x1: x + 220, y1: 360 }, bbox: { x0: x - 70, y0: 330, x1: x + 290, y1: 620 },
    affixes: ['exemplo'], unknown: [], visible: true, goalText: `${fe} FE`, ...extra,
  });
  const demoRound = { picks: 2, summary: ['Wealth: Void Sea Treasures drop 15 additional Memory Scrap(s)', 'Wonder: +84% ... multiplied by 3 time(s)'], scrapExtra: 15, scrapMult: 1.68, guaranteedFE: 10.2, expectedFE: 17.4, jackpotFE: 28.2 };
  const demo: OverlayState = {
    mode: 'cards', goal: 'fe', goalLabel: 'Máximo FE', flames: [], bestFlameKey: null, round: demoRound,
    show: true, status: 'ready', frameW: 1920, frameH: 1080, routesLeft: 4, bestKey: 'b',
    cards: [
      card('b', 'boss', 'rare', 1290, 18.8, { invitation: 18.8 }),
      card('w', 'wealth', 'legendary', 440, 5.78, { scrap: 5.78 }),
      card('o', 'wonder', 'magic', 850, 0.68, { scrap: 0.6, thread: 0.08 }, { estimated: true }),
    ],
  };
  overlayVisible = true;
  placeOverlay();
  overlay.webContents.send(CHANNELS.overlay, demo);
  sendPanel();
  await new Promise((r) => setTimeout(r, 1500));
  await panel.webContents.executeJavaScript("document.getElementById('goal-box').open = true");
  await new Promise((r) => setTimeout(r, 400));
  writeFileSync(join(dir, 'panel.png'), (await panel.webContents.capturePage()).toPNG());
  writeFileSync(join(dir, 'overlay.png'), (await overlay.webContents.capturePage()).toPNG());
  const flameDemo: OverlayState = {
    ...demo, mode: 'flames', cards: [], bestKey: null, bestFlameKey: 'Boss Rare+ garantido', frameW: 1919, frameH: 1079,
    flames: [
      { key: 'Boss Rare+ garantido', label: 'Boss Rare+ garantido', raw: '', valueFE: 7.2, goalText: '7.2 FE', quality: 'legendary', current: false, pos: { x: 707, y: 328, size: 54 } },
      { key: 'Wealth Magic+ garantido', label: 'Wealth Magic+ garantido', raw: '', valueFE: 0.9, goalText: '0.9 FE', quality: 'rare', current: false, pos: { x: 650, y: 427, size: 60 } },
      { key: 'Armament Rare+ garantido', label: 'Armament Rare+ garantido', raw: '', valueFE: 0.8, goalText: '0.8 FE', quality: 'legendary', current: true, pos: { x: 1208, y: 332, size: 60 } },
    ],
  };
  overlay.webContents.send(CHANNELS.overlay, flameDemo);
  await new Promise((r) => setTimeout(r, 800));
  writeFileSync(join(dir, 'overlay-flames.png'), (await overlay.webContents.capturePage()).toPNG());
  await calibrate();
  writeFileSync(join(dir, 'calibration-dir.txt'), overlayMessage ?? '');
  app.quit();
}

app.on('will-quit', () => {
  saveSession();
  globalShortcut.unregisterAll();
  tail?.stop();
  prices?.stop();
  void stopOcr();
});
