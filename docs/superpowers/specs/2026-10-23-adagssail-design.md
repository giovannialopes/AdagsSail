# AdagsSail — Design

Data: 2026-10-23 · Jogo: Torchlight: Infinite · Temporada: SS14 (Tartarus, início 2026-10-16) · Cliente: global, idioma inglês

## Objetivo

Overlay para Windows que, na tela de escolha de **Seal Whisper** do Blacksail (3 cartas, escolhe 1),
lê as 3 cartas, calcula o valor esperado de cada uma em Flame Elementium (FE) com preços atuais da
SS14 e **destaca** a melhor. Também conta o que realmente caiu dos baús do Blacksail na sessão
(Memory Scrap, Memory Thread Magic/Rare/Epic, Void Sea Invitations).

Fora de escopo: clicar/mover o mouse/enviar input ao jogo (risco de ban — decisão do usuário),
leitura de memória do processo, Confusion Cards do Netherrealm, cliente CN, outros idiomas.

## Regras de dados

- Só dados da SS14. Tabelas de afixos vêm do tlidb.com (páginas `Whisper_of_Wealth`,
  `Whisper_of_Wonder`, `Whisper_of_Armament`, `Boss_Whisper`) capturadas em 2026-10-23 e gravadas
  em `src/data/whispers.json` com a data da captura.
- Preços: **somente TITrack** (`https://titrack.ninja/item/{id}?season=1601`), mediana mais recente
  (`price_fe_median`, `p10`, `p90`, `unique_devices`) extraída do HTML. Atualiza a cada 15 min,
  cache em disco (`prices-cache.json`) usado se o site falhar; o overlay mostra a idade do preço.
- IDs (ConfigBaseId): Memory Scrap 5140 · Thread Magic 5142 · Thread Rare 5143 · Thread Epic 5144 ·
  Blacksail Compass 10170 · Returning Blacksail Compass 10171 · Void Sea Invitation Craving 410201 ·
  Ecstasy 410202 · Sorrow 410203.

## Descobertas no UE_game.log real (SS14, log do usuário de 2026-10-23)

Log em `D:/SteamLibrary/steamapps/common/Torchlight Infinite/UE_game/TorchLight/Saved/Logs/UE_game.log`
(prefixos `TLLua:`/`TLGame:`/`TLShipping:`). O log **não** contém o texto das cartas (só contagens),
então o OCR é necessário para ler as cartas — mas o log dá gatilhos exatos:

| Evento | Linha (regex) |
|---|---|
| Tela de escolha abriu | `LoadSubLevelFromCfg END! InSubLevelPath = /Game/Art/Maps/S2/XuKongHaiTu/` |
| Clique numa carta | `requested row 'VoidAltarCoord_BtnSelect'` ou `AudioEnum  == S2_System_Card_Click` |
| Carta confirmada (+ raridade) | `VoidAltarCoord_Rarity(\d)SelectedBtn` / `AudioEnum  == S2_System_Card_Confirm` |
| Tela fechou | `UnLoadSubLevelFromCfg END! SubLevelName = /Game/Art/Maps/S2/XuKongHaiTu/` |
| Escolhas restantes | `SeasonAltar ReceiveServerData SelectedRoutes-Num:\[(\d+)\].*LeftRouteTimes:(\d+)` |
| Baú do Blacksail aberto | `'Play_Obj_BlackSail_Chest_Open'` |
| Drop | `ItemChange@ ProtoName=PickItems? start` … `ItemChange@ (Add\|Update) Id=(\d+)_\S+ BagNum=(\d+) in PageId=(\d+) SlotId=(\d+)` … `end` |
| Snapshot do inventário | `BagMgr@:InitBagData PageId = N SlotId = N ConfigBaseId = N Num = N` |
| Slot esvaziado | `BagMgr@:RemoveBagItem PageId = N SlotId = N` |

Drop = `BagNum` − quantidade anterior do mesmo slot (Add sem estado anterior = BagNum). Update sem
estado anterior conhecido só registra o estado (sem contar), igual ao TITrack.

Como a disposição exata da tela SS14 ainda não foi vista, a leitura é **independente de layout**:
OCR da janela inteira → acha os títulos (`Whisper of Wealth|Wonder|Armament`, `Boss Whisper`) →
agrupa as linhas de afixo sob cada título. A cada clique numa carta (gatilho do log) o app captura de
novo e acumula as cartas lidas naquela tela; assim funciona tanto com 3 cartas lado a lado quanto com
um painel de detalhes que mostra uma carta por vez.

## Arquitetura

Electron + TypeScript, empacotado como `.exe` portátil (electron-builder). Sem framework de UI
(HTML/CSS/TS puros). Tesseract.js com `eng.traineddata` empacotado localmente (sem CDN).

```
main process
  game-window   (koffi → user32/dwmapi: acha a janela "Torchlight: Infinite", retângulo, foreground)
  log-tail      (lê UE_game.log incremental a cada 250 ms)
  prices        (TITrack + cache)
  hotkeys       (globalShortcut)
  windows       (overlay de cartas, painel de drops)
  capture       (desktopCapturer: thumbnail da janela do jogo no tamanho real)
  ocr           (tesseract.js em Node, eng.traineddata local)
renderer
  overlay       (etiquetas sobre as cartas + painel de cartas)
  panel         (contador de drops)
shared (puro, testável em Node)
  layout        (linhas OCR com bbox → cartas; qualidade pela cor)
  parser        (texto OCR → afixos estruturados)
  blacksail-log (linhas do log → eventos da tela de escolha)
  valuation     (afixos × preços → EV em FE por item)
  loot          (linhas do log → eventos de drop)
```

### Unidades

| Unidade | Entrada | Saída | Depende de |
|---|---|---|---|
| `game-window` | — | `{hwnd, bounds, focused}` | koffi |
| `capture`+`ocr` | hwnd | `OcrLine[]` `{text, conf, bbox}` + bitmap | Electron, tesseract.js |
| `layout` | `OcrLine[]`, bitmap | `CardRead[]` `{bbox, type, quality, lines[], conf}` | — |
| `parser` | `title`, `lines[]` | `Affix[]` `{kind, item, amount, chance, multiplier, raw, matched}` | whisper-db |
| `valuation` | `Affix[]`, `PriceMap` | `{totalFE, byItem{scrap,thread*,invitation,heroMemory}, unknown[]}` | — |
| `prices` | lista de IDs | `PriceMap` `{id → {fe, p10, p90, devices, fetchedAt}}` | fetch, fs |
| `loot` | linhas do log | `LootEvent{id, qty, at}` | — |
| `overlay` | 3 resultados + rects | desenho por cima do jogo | — |

### Fluxo — escolha de cartas

1. Gatilho pelo log (tela abriu / clique em carta) → espera 350 ms e captura a janela do jogo
   (`desktopCapturer` com thumbnail no tamanho da janela). Hotkey `Ctrl+Alt+W` força uma análise.
2. OCR da imagem inteira (tesseract.js, linhas com bbox). `layout` acha os títulos de Whisper e
   agrupa as linhas de afixo de cada carta (coluna mais próxima abaixo do título).
3. Qualidade pela cor do título (branco=Normal, azul=Magic, roxo=Rare, dourado=Legendary) —
   só para exibição; o valor vem dos números lidos.
4. `parser` identifica o tipo pelo título (`Whisper of Wealth|Wonder|Armament`, `Boss Whisper`) e
   casa cada linha com os padrões de afixo da `whisper-db` (regex tolerante a erros comuns do OCR:
   `O/0`, `l/1`, `%` perdido).
5. `valuation` calcula EV: quantidade fixa × preço; "X% chance de N" → X·N; "+X% quantidade" e
   "chance x2/x3" → aplicados sobre a **linha de base** do baú (constante `BASE_DROPS` em
   `whisper-db`, ajustável; enquanto não houver dados medidos usa a referência ~200 Scraps/run da
   IGGM SS14 e marca o valor como "estimado"). Afixos não reconhecidos entram em `unknown[]` e são
   mostrados com "?" — nunca recebem valor inventado.
6. Overlay: etiqueta com total FE e decomposição ao lado de cada título visível; a melhor recebe
   moldura dourada e "★ MELHOR". Um painel lista todas as cartas lidas nesta tela, ordenadas por FE.
   Tudo some quando o log indica que a tela fechou.

### Fluxo — contador de drops

1. `log-tail` encontra o log: processo `torchlight_infinite.exe` → `..\..\..\TorchLight\Saved\Logs\UE_game.log`;
   senão Steam (`appmanifest_1974050.acf`); senão caminho configurado manualmente.
2. Lê do fim, a cada 250 ms, no máximo 512 KB por ciclo; trata rotação/truncamento.
3. `loot` usa as linhas `ItemChange@`/`BagMgr@` descritas acima (estado por slot, delta dentro de
   blocos `PickItem(s)`). Contabiliza Scrap, Threads, Invitations e Hero Memories (71001–71003).
4. Painel arrastável: totais da sessão e do último baú (agrupado por janela de 10 s), FE total e
   FE/hora, e a razão Scrap vs Thread em FE. Botão "zerar sessão".
5. Se o log não estiver habilitado (arquivo não muda), o painel avisa: "Ative Enable Log no menu Esc".

Formato confirmado no log real do usuário; testes usam trechos reais como fixture.

### Modo calibração

`Ctrl+Alt+K` salva em `%APPDATA%/AdagsSail/calibration/<timestamp>/`: `frame.png` (resolução cheia),
`detect.json` (painéis, cores, texto OCR, afixos e EV) e `log-tail.txt` (últimos 2 MB do log).
Botão no painel "Abrir pasta de calibração".

### Hotkeys

`Ctrl+Alt+O` mostrar/ocultar overlay · `Ctrl+Alt+K` calibração · `Ctrl+Alt+R` zerar sessão.

### Janelas

Overlay: `transparent, frame:false, alwaysOnTop('screen-saver'), focusable:false, skipTaskbar`,
`setIgnoreMouseEvents(true,{forward:true})`, reposicionado sobre o retângulo do jogo a cada 1 s.
Painel de drops: janela pequena, transparente, arrastável, não captura cliques fora dela.

## Erros

- Jogo não encontrado → painel mostra "aguardando Torchlight: Infinite"; tenta de novo a cada 3 s.
- Captura da janela vazia/preta → fallback: captura da tela inteira recortada pelo retângulo do jogo.
- TITrack fora/HTML mudou → usa cache e mostra "preços de HH:MM"; sem cache → valores mostram "sem preço".
- OCR com baixa confiança (< 60) numa carta → etiqueta "leitura incerta" e não marca como melhor
  se a diferença para a segunda for menor que a incerteza.

## Testes

Vitest, em Node, para as unidades puras: `parser` (textos de afixo reais do tlidb + variações com
erros de OCR), `valuation` (casos com chance, quantidade fixa, multiplicadores, afixo desconhecido),
`prices` (parse do HTML salvo do TITrack), `loot` (amostras de log no formato ETor). `detector`
`layout` testado com linhas OCR sintéticas; com imagens reais quando a calibração fornecer prints da SS14.

## Entregáveis

`C:/Users/Giovanni/Desktop/Blacksail/AdagsSail/` com código, `npm run dev`, `npm test`,
`npm run dist` → `dist/AdagsSail-<versão>-portable.exe`, e README em português.

## Atualização após prints reais (2026-10-23)

A tela de escolha é a **Void Sea Terminal**: 3 cartas lado a lado em posições fixas (centros em
−0,3208·H, 0 e +0,3333·H a partir do centro da área útil; título em 0,58·H, afixo até 0,67·H), uma linha
de afixo por carta, número em branco maior, botão **Switch** (troca as cartas). Implementado:
leitura por recortes fixos (`src/shared/terminal.ts`) com fallback genérico, releitura a cada 0,6 s
enquanto a tela está aberta, cada posição guarda a leitura mais limpa, e correção de erros de OCR
validada contra as tabelas SS14. O HUD do mapa lista os Whispers já escolhidos (somados) — não é lido.
