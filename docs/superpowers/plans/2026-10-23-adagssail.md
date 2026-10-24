# AdagsSail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay Electron que lê as cartas (Seal Whispers) do Blacksail na SS14, calcula o valor em FE de cada uma com preços do TITrack, destaca a melhor e conta Scrap/Thread/Invitation que caem.

**Architecture:** Main process Electron faz tudo de I/O (tail do log, captura via desktopCapturer, OCR tesseract.js em Node, preços TITrack). Lógica pura (parsers, layout, valuation, loot) fica em `src/shared/` testada com Vitest. Duas janelas renderer: overlay click-through sobre o jogo e painel de drops.

**Tech Stack:** Electron 33+, TypeScript 5, esbuild, Vitest, tesseract.js (Node), koffi (FFI user32/dwmapi), electron-builder (portable).

## Global Constraints

- Nunca enviar input ao jogo (sem clique/teclas simuladas). Nunca ler memória do processo.
- Só dados SS14; preços só do TITrack `https://titrack.ninja/item/{id}?season=1601`.
- IDs: Scrap 5140, Thread 5142/5143/5144, Invitations 410201/410202/410203, Hero Memory 71001–71003.
- Afixo não reconhecido nunca recebe valor (vai para `unknown`).
- UI em português; textos do jogo em inglês.
- OCR 100% local (eng.traineddata empacotado, sem CDN).

---

### Task 1: Scaffold + tipos + itens

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `build.mjs`, `.gitignore`, `src/shared/types.ts`, `src/shared/items.ts`, `test/items.test.ts`

**Produces:**
```ts
export type ItemKey = 'scrap'|'threadMagic'|'threadRare'|'threadEpic'|'invCraving'|'invEcstasy'|'invSorrow'|'heroMemory';
export const ITEMS: Record<number,{key:ItemKey,name:string}>; // 5140..410203, 71001-71003
export const PRICE_IDS: number[]; // ids buscados no TITrack (sem Hero Memory)
export interface PriceEntry { fe:number; p10:number; p90:number; devices:number; bucket:string; fetchedAt:number }
export type PriceMap = Record<number, PriceEntry>;
```
- [ ] Teste: `ITEMS[5140].key === 'scrap'`, `PRICE_IDS` contém 7 ids e não contém 71001.
- [ ] Implementar, `npm test` verde, commit.

### Task 2: Parser de preços TITrack

**Files:** `src/shared/titrack.ts`, `test/titrack.test.ts`, `test/fixtures/titrack-5140.html` (HTML real salvo em 2026-10-23)

**Produces:** `parseTitrackHtml(html:string): Omit<PriceEntry,'fetchedAt'> | null` — pega o objeto `{hour_bucket, price_fe_median, p10, p90, unique_devices}` com maior `hour_bucket` (JSON escapado `\"` no RSC).
- [ ] Teste: fixture → `fe≈0.0742857`, `devices=391`, `bucket='2026-10-23T18:00:00+00:00'`; HTML sem dados → `null`.
- [ ] Implementar com regex `/\{\\?"hour_bucket\\?":\\?"([^"\\]+)\\?",\\?"price_fe_median\\?":([\d.]+),\\?"price_fe_p10\\?":([\d.]+),\\?"price_fe_p90\\?":([\d.]+),\\?"submission_count\\?":\d+,\\?"unique_devices\\?":(\d+)\}/g`.
- [ ] Commit.

### Task 3: Parser de afixos (texto OCR → Affix[])

**Files:** `src/shared/whisper-parser.ts`, `test/whisper-parser.test.ts`

**Produces:**
```ts
export type WhisperType = 'wealth'|'wonder'|'armament'|'boss'|'unknown';
export type AffixItem = 'scrap'|'thread'|'hero'|'invitation';
export type Affix =
 | {kind:'baseQty'|'treasureQty'|'rarity', pct:number, raw:string}
 | {kind:'appear'|'itemQty', item:AffixItem, pct:number, raw:string}
 | {kind:'flat', item:AffixItem, n:number, raw:string}
 | {kind:'chanceFlat', item:AffixItem, pct:number, n:number, raw:string}
 | {kind:'multiply', item:AffixItem, pct:number, times:number, raw:string};
export function normalizeOcr(s:string):string;      // O→0 e l/I→1 dentro de números, '°/o'→'%', espaços
export function detectType(title:string):WhisperType;
export function parseAffixes(text:string):{affixes:Affix[], unknown:string[]};
```
- [ ] Testes com textos reais do tlidb SS14 (Wealth/Wonder/Armament, todas as formas), um com erro de OCR (`+3O % ...`), linha de Invitation (`Void Sea Treasures drop 2 additional Void Sea Invitation(s)`), e linha desconhecida com número → `unknown`.
- [ ] Implementar (ordem: multiply, chanceFlat, appear, itemQty, baseQty, treasureQty, rarity, flat; consumir spans), commit.

### Task 4: Valuation

**Files:** `src/shared/valuation.ts`, `test/valuation.test.ts`

**Consumes:** `Affix`, `PriceMap`. **Produces:**
```ts
export interface Baseline { scrapChance:number; scrapQty:number; threadChance:number; threadQty:number; heroChance:number; heroQty:number;
  threadMix:{magic:number;rare:number;epic:number}; invitationMix:{craving:number;ecstasy:number;sorrow:number}; heroMemoryFE:number; rarityEpicFactor:number }
export const DEFAULT_BASELINE: Baseline;
export interface CardValue { totalFE:number; parts:Record<AffixItem,number>; estimated:boolean; missingPrices:boolean }
export function itemPrice(item:AffixItem, prices:PriceMap, b:Baseline):number|null;
export function valueAffixes(affixes:Affix[], prices:PriceMap, b?:Baseline):CardValue;
```
Regras: flat → n·preço; chanceFlat → pct/100·n·preço; itemQty → chance·qty·pct/100; appear → min(1−c, c·pct/100)·qty; baseQty/treasureQty → aplica pct a scrap, thread e hero do baseline; multiply → pct/100·(times−1)·c·qty; rarity → desloca threadMix p/ epic (`epic·(1+pct/100·rarityEpicFactor)`, renormaliza) × threads esperadas. `estimated=true` se usou baseline.
- [ ] Testes: Wealth Legendary flat 39 Scraps × 0.0742857 ≈ 2.897; chance 20%×194 ≈ 2.882; multiply sem preço → `missingPrices`; soma de parts = total.
- [ ] Implementar, commit.

### Task 5: Layout (linhas OCR → cartas) + qualidade por cor

**Files:** `src/shared/layout.ts`, `test/layout.test.ts`

**Produces:**
```ts
export interface BBox {x0:number;y0:number;x1:number;y1:number}
export interface OcrLine {text:string; conf:number; bbox:BBox}
export type Quality = 'normal'|'magic'|'rare'|'legendary'|'unknown';
export interface CardRead { type:WhisperType; title:string; bbox:BBox; titleBox:BBox; lines:string[]; conf:number; quality:Quality }
export function groupCards(lines:OcrLine[], frameW:number):Omit<CardRead,'quality'>[];
export function classifyQuality(rgba:Uint8Array|Buffer, width:number, box:BBox, bgra?:boolean):Quality;
```
- [ ] Testes: 3 títulos lado a lado com linhas embaixo → 3 cartas com as linhas certas; 1 título (painel de detalhe) → 1 carta; pixels azuis/roxos/dourados/cinza → magic/rare/legendary/normal.
- [ ] Implementar, commit.

### Task 6: Eventos do log (tela de escolha + loot)

**Files:** `src/shared/blacksail-log.ts`, `src/shared/loot.ts`, `test/blacksail-log.test.ts`, `test/loot.test.ts`, `test/fixtures/blacksail-screen.log`, `test/fixtures/loot.log` (trechos reais do log do usuário)

**Produces:**
```ts
export type ScreenEvent = {type:'open'}|{type:'click'}|{type:'confirm', rarity?:number}|{type:'close'}|{type:'routes', selected:number, left:number}|{type:'chest'};
export function parseScreenLine(line:string):ScreenEvent|null;
export interface LootDrop { id:number; key:ItemKey; qty:number; at:number; inChest:boolean }
export class LootTracker { feed(line:string, now?:number):LootDrop[]; reset():void; session:Record<ItemKey,number>; lastChest:Record<ItemKey,number>; chests:number }
```
- [ ] Testes: fixture da tela → sequência open, click, click, confirm(2), close; loot fixture → Scrap delta, Thread Epic Add=6 e Update 7 (delta 1), item não rastreado ignorado, Update sem estado anterior não conta, chest agrupa drops por 60 s.
- [ ] Implementar, commit.

### Task 7: Main — log tail, caminho do log, preços com cache

**Files:** `src/main/log-path.ts`, `src/main/log-tail.ts`, `src/main/prices.ts`, `src/main/settings.ts`, `test/log-tail.test.ts`

**Produces:** `findLogPath():Promise<string|null>` (processo → Steam libraryfolders → caminhos padrão → settings); `class LogTail extends EventEmitter` (`'line'`, poll 250 ms, 512 KB/ciclo, começa do fim, reabre em truncamento); `class PriceService` (`get():PriceMap`, `refresh()`, intervalo 15 min, cache em `userData/prices-cache.json`); `loadSettings()/saveSettings()` com `logPath?`, `baseline`, `hotkeys`.
- [ ] Teste do LogTail com arquivo temporário (append → linhas emitidas; truncar → continua).
- [ ] Implementar, commit.

### Task 8: Main — janela do jogo, captura, OCR, orquestração, overlay e painel

**Files:** `src/main/game-window.ts`, `src/main/capture.ts`, `src/main/ocr.ts`, `src/main/analyzer.ts`, `src/main/calibration.ts`, `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/overlay.html|ts|css`, `src/renderer/panel.html|ts|css`, `resources/tessdata/eng.traineddata`

- `game-window`: koffi `FindWindowW(null,'Torchlight: Infinite')`, `DwmGetWindowAttribute(9)`, `GetForegroundWindow`, `IsIconic`; retorna `{hwnd, rect(px), focused}`; converte p/ DIP com `screen.screenToDipRect`.
- `capture`: `desktopCapturer.getSources({types:['window'], thumbnailSize:{w,h}})`, escolhe `id` `window:<hwnd>:0` ou nome; fallback tela inteira recortada.
- `ocr`: worker tesseract.js único, `langPath` local, PSM 11 (sparse text), retorna `OcrLine[]`.
- `analyzer`: no evento `open`/`click`/hotkey → espera 350 ms → captura → OCR → `groupCards` → `classifyQuality` → `parseAffixes` → `valueAffixes` → acumula por tela (chave `type+linhas`) → envia `overlay:update`. Em `close` → `overlay:clear`.
- `calibration`: `Ctrl+Alt+K` → salva `frame.png`, `detect.json`, `log-tail.txt` (últimos 2 MB).
- overlay: janela transparente click-through sobre o jogo; etiquetas posicionadas proporcionalmente (`bbox/frameW*gameW`); painel de cartas ordenado.
- panel: contador da sessão/último baú, FE total, FE/h, status (log/jogo/preços).
- [ ] `npm run build` sem erros de tipo; `npm run dev` abre painel; com log de teste reproduzido, overlay mostra cartas.
- [ ] Commit.

### Task 9: Empacotamento + README

**Files:** `electron-builder.yml`, `README.md`
- [ ] `npm run dist` gera `dist/AdagsSail-1.0.0-portable.exe`; README em PT-BR (requisitos: jogo em janela/borderless, "Enable Log" ligado, hotkeys, calibração).
- [ ] Commit.
