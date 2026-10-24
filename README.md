# AdagsSail

Overlay para **Torchlight: Infinite — SS14 (Tartarus)** que ajuda no **Blacksail**:

- lê as **cartas (Seal Whispers)** e as **Void Sea Flames** na tela e marca com **★ MELHOR** a melhor
  opção, com o valor em **FE** (preços atuais do mercado, via [TITrack](https://titrack.ninja));
- você escolhe a **prioridade de farm**: Máximo FE, Hero Memory (vermelha), Memory Scrap, Memory Thread
  ou Invitation;
- conta o que caiu na sessão (Scrap, Thread, Invitations, Hero Memory, Embers, Fluorescent Memory),
  o **tempo em mapa**, os baús e o FE/h;
- mostra a **rodada atual** (as 6 cartas até o baú): quanto é **garantido**, a **média** e o **máximo**.

> O AdagsSail **não clica, não aperta teclas e não lê a memória do jogo**. Ele só lê o arquivo de log
> do jogo e tira print da janela — quem escolhe é você.

## Download

Baixe o `AdagsSail-<versão>-portable.exe` na página de
**[Releases](../../releases/latest)**. Não precisa instalar: é só abrir.

O Windows pode mostrar **"O Windows protegeu o computador"** (o app não tem assinatura digital paga).
Clique em **Mais informações → Executar assim mesmo**.

## Como usar

1. No jogo: **Esc → Settings → Other → Enable Log** (sem isso o app não sabe quando as telas abrem
   nem o que caiu).
2. Jogue em **janela** ou **tela cheia sem borda** (o overlay não aparece em tela cheia exclusiva).
3. Abra o AdagsSail. O painel aparece (arraste pelo título).
4. **Tela das Flames ("Put in Void Sea Flames")**: clique em cada Flame (clicar não confirma); o app
   lê o texto e circula a melhor.
5. **Tela das cartas ("Void Sea Terminal")**: o app lê as 3 cartas sozinho e marca a melhor.

No painel:

| | |
|---|---|
| **Sessão / Tempo em mapa / Baús** | totais da sessão (continuam depois de fechar e abrir o app) |
| **Rodada atual** | garantido / média / máximo em FE do baú desta rodada |
| **Prioridade de farm** | o que o app deve priorizar ao escolher |
| **Ler cartas** | força uma leitura agora (normalmente é automático) |
| **Zerar** | recomeça a contagem da sessão |
| **Esconder overlay** | esconde/mostra as marcas sobre o jogo |

Atalhos: `Ctrl+Alt+W` ler agora · `Ctrl+Alt+O` overlay · `Ctrl+Alt+R` zerar ·
`Ctrl+Alt+K` salvar calibração (print + leitura, para reportar erro de leitura).

## Como o valor é calculado

- **Preços**: TITrack, temporada SS14, mediana da última hora, atualizados a cada 15 min.
- **Garantido** = afixos de quantidade fixa ("drop 39 additional Memory Scraps") e % sobre o baú base.
  **Chance** = afixos "X% chance…" (Boss Whisper, ×2/×3, "20% chance for N…") — entram pela média.
- O **baú base** e o efeito do **Drop Rarity** em Hero Memories são estimativas (marcadas com **≈**),
  ajustáveis em `%APPDATA%\AdagsSail\settings.json → baseline`.
- Boss Whisper: 5% / 10% / 20% / 40% de chance de 1 Invitation (Normal / Magic / Rare / Legendary).

Histórico de cada tela e de cada baú fica em `%APPDATA%\AdagsSail\history\` (com prints JPEG) — útil
para calibrar o app com dados reais. Erros em `%APPDATA%\AdagsSail\error.log`.

## Desenvolvimento

```bash
npm install
npm test            # testes (Vitest)
npm run dev         # build + abre o app
npm run selftest    # teste de ponta a ponta no Electron com prints reais da SS14
npm run dist        # gera dist/AdagsSail-<versão>-portable.exe
```

> No terminal do VS Code, rode sem a variável `ELECTRON_RUN_AS_NODE`
> (`env -u ELECTRON_RUN_AS_NODE npm run dev`), senão o Electron abre como Node e fecha na hora.

```
src/shared/   lógica pura e testada (parser de afixos, valor, objetivos, Flames, rodada, loot, log)
src/main/     Electron: log, preços, captura (Windows Graphics Capture), OCR local (tesseract.js)
src/renderer/ overlay, painel e janela oculta de captura
test/         testes + prints reais da SS14 e trechos do UE_game.log
```

### Sinais do log usados (SS14)

| Evento | Linha do `UE_game.log` |
|---|---|
| Tela das cartas abriu/fechou | `LoadSubLevelFromCfg END! … /S2/XuKongHaiTu/…` / `UnLoadSubLevelFromCfg END! …` |
| Carta escolhida (raridade) | `VoidAltarCoord_Rarity<N>SelectedBtn` |
| Tela das Flames | `VoidBeacon Run` / `S2_System_Fire_Click` / `VoidBeacon Destory` |
| Baú aberto | `'Play_Obj_BlackSail_Chest_Open'` |
| Drops | `ItemChange@ ProtoName=PickItem(s) start` → `ItemChange@ Add/Update Id=<id>_… BagNum=<n> …` |

## Licença

MIT. Projeto de fã, sem relação com a XD. Preços: TITrack. Dados das cartas: tlidb.com.
