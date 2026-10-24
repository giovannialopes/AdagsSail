// Gravador de calibração (desenvolvimento): segue o UE_game.log real e, a cada evento da tela de
// escolha, salva print da janela do jogo + leitura OCR. Só leitura. Uso: npm run watch -- <minutos>
import { app } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseScreenLine } from '../../src/shared/blacksail-log';
import { ChoiceSession } from '../../src/shared/session';
import { readCards } from '../../src/main/analyzer';
import { captureGame, initCapture } from '../../src/main/capture';
import { findGameWindow } from '../../src/main/game-window';
import { findLogPath } from '../../src/main/log-path';
import { LogTail } from '../../src/main/log-tail';
import { stopOcr } from '../../src/main/ocr';

const minutes = Number(process.argv.at(-1)) || 20;
const out = join(process.cwd(), 'out', 'watch');
const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 1, bucket: 'x', fetchedAt: 0 });
const PRICES = { 5140: p(0.0742857), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };

let n = 0;
let busy = Promise.resolve();
const recent: string[] = [];

function snap(reason: string, delay: number): void {
  busy = busy.then(async () => {
    await new Promise((r) => setTimeout(r, delay));
    const g = findGameWindow();
    if (!g) return;
    const frame = await captureGame(g);
    if (!frame) return console.log(`[watch] ${reason}: captura falhou`);
    const id = String(++n).padStart(3, '0');
    const scan = await readCards(frame);
    const s = new ChoiceSession();
    s.add(scan.reads, PRICES);
    writeFileSync(join(out, `${id}-${reason}.png`), frame.image.toPNG());
    writeFileSync(
      join(out, `${id}-${reason}.json`),
      JSON.stringify({ reason, ms: scan.ms, lines: scan.lines, reads: scan.reads, ranked: s.ranked(), log: recent.slice(-80) }, null, 2),
    );
    console.log(`[watch] ${id} ${reason}: ${scan.lines.length} linhas, ${scan.reads.length} cartas (${scan.ms} ms)`);
  });
}

app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true });
  initCapture(join(__dirname, 'preload.js'), join(__dirname, 'renderer'));
  const file = await findLogPath();
  if (!file) {
    console.log('[watch] log não encontrado');
    return app.exit(1);
  }
  console.log(`[watch] seguindo ${file} por ${minutes} min`);
  const tail = new LogTail(file);
  tail.on('line', (line: string) => {
    recent.push(line);
    if (recent.length > 400) recent.shift();
    const ev = parseScreenLine(line);
    if (!ev) return;
    console.log(`[watch] evento ${JSON.stringify(ev)}`);
    if (ev.type === 'open') {
      snap('open', 350);
      snap('open-late', 1200);
    }
    if (ev.type === 'click') snap('click', 350);
    if (ev.type === 'picked') snap('picked', 0);
  });
  tail.start();
  setTimeout(async () => {
    tail.stop();
    await busy;
    await stopOcr();
    console.log('[watch] fim');
    app.exit(0);
  }, minutes * 60_000);
});
