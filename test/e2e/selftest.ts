// Teste de ponta a ponta dentro do Electron (não roda no Vitest):
//  1) renderiza uma tela sintética de 3 Seal Whispers, captura, OCR, agrupa e avalia;
//  2) captura a janela real do jogo (se aberta) e salva frame + linhas OCR.
// Uso: npm run selftest
import { app, BrowserWindow, nativeImage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChoiceSession } from '../../src/shared/session';
import { captureGame, initCapture, ocrImage, type Frame } from '../../src/main/capture';
import { findGameWindow } from '../../src/main/game-window';
import { calibrateSeal, readCards, readSeal, readSealText, readTerminal, scanChoice, sealQuick } from '../../src/main/analyzer';
import { flameNear } from '../../src/shared/flameslots';
import { parseFlame } from '../../src/shared/flames';
import { recognize, stopOcr } from '../../src/main/ocr';

const p = (fe: number) => ({ fe, p10: fe, p90: fe, devices: 1, bucket: 'x', fetchedAt: 0 });
const PRICES = { 5140: p(0.0742857), 5142: p(0.0076), 5143: p(0.026), 5144: p(0.9), 410201: p(18), 410202: p(32.65), 410203: p(6) };

const CARD = (title: string, color: string, lines: string[]) => `
  <div class="card"><h2 style="color:${color}">${title}</h2>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;

const HTML = `<!doctype html><html><body style="margin:0;background:#0b0d16;font-family:'Segoe UI';color:#d9d4c7;width:1920px;height:1080px">
<style>.row{display:flex;gap:60px;justify-content:center;padding-top:300px}.card{width:380px;padding:24px;border:2px solid #333a55;border-radius:12px;background:#151a2c}
h2{font-size:26px;margin:0 0 16px;text-align:center}p{font-size:19px;margin:8px 0}</style>
<div class="row">
${CARD('Whisper of Wealth', '#ffae3a', ['Void Sea Treasures drop 39 additional Memory Scrap(s)', '20% chance for 194 additional Memory Scrap(s) to drop from Void Sea Treasures'])}
${CARD('Whisper of Wonder', '#6fb2ff', ['+14% Void Sea Treasure Base Drop Quantity', '+21% chance for Memory Scraps dropped from Void Sea Treasures to be multiplied by 2 time(s)'])}
${CARD('Boss Whisper', '#b77cff', ['Void Sea Treasures drop 1 additional Void Sea Invitation(s)'])}
</div></body></html>`;

async function synthetic(out: string): Promise<boolean> {
  const win = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage();
  const { width, height } = image.getSize();
  const frame: Frame = { image, bgra: image.toBitmap(), width, height, method: 'synthetic' };
  const { lines, reads, ms } = await readCards(frame);
  const s = new ChoiceSession();
  s.add(reads, PRICES);
  const ranked = s.ranked().map((c) => ({ type: c.type, quality: c.quality, fe: +c.value.totalFE.toFixed(3), affixes: c.affixes.map((a) => a.kind), unknown: c.unknown }));
  writeFileSync(join(out, 'synthetic.png'), image.toPNG());
  writeFileSync(join(out, 'synthetic.json'), JSON.stringify({ ms, lines, ranked, best: s.bestKey() }, null, 2));
  console.log(`[synthetic] OCR ${ms} ms, ${lines.length} linhas`);
  console.log('[synthetic] ranking:', JSON.stringify(ranked));
  const ok =
    ranked.length === 3 &&
    ranked[0].type === 'boss' &&
    ranked.find((c) => c.type === 'wealth')?.affixes.length === 2 &&
    ranked.find((c) => c.type === 'wonder')?.affixes.length === 2 &&
    ranked.every((c) => c.unknown.length === 0);
  const q = Object.fromEntries(ranked.map((c) => [c.type, c.quality]));
  console.log('[synthetic] qualidades:', JSON.stringify(q));
  return ok && q.wealth === 'legendary' && q.wonder === 'magic' && q.boss === 'rare';
}

// Prints reais da SS14 (janela 1922x1112, área útil em (1,31) 1920x1080).
async function realFixtures(): Promise<boolean> {
  const dir = join(process.cwd(), 'test', 'fixtures', 'ss14');
  const client = { x: 1, y: 31, width: 1920, height: 1080 };
  const load = (f: string): Frame => {
    const image = nativeImage.createFromPath(join(dir, f));
    const { width, height } = image.getSize();
    return { image, bgra: image.toBitmap(), width, height, method: 'synthetic' };
  };
  const expected = [
    { kind: 'flat', item: 'scrap', n: 15 },
    { kind: 'appear', item: 'thread', pct: 53 },
    { kind: 'appear', item: 'scrap', pct: 14 },
  ];
  let ok = true;
  for (const f of ['terminal.png', 'terminal-anim.png']) {
    const scan = await readTerminal(load(f), client);
    const s = new ChoiceSession();
    s.add(scan.reads, PRICES);
    const got = scan.reads.map((r) => {
      const c = s.ranked().find((x) => x.slot === r.slot)!;
      return { slot: r.slot, type: r.type, quality: r.quality, affixes: c.affixes, unknown: c.unknown };
    });
    console.log(`[ss14] ${f}: ${scan.ms} ms`, JSON.stringify(got.map((g) => [g.slot, g.type, g.quality, g.affixes.map((a) => a.raw), g.unknown])));
    const pass =
      got.length === 3 &&
      got.every((g, i) => g.type === 'wealth' && g.affixes.length === 1 && Object.entries(expected[i]).every(([k, v]) => (g.affixes[0] as unknown as Record<string, unknown>)[k] === v));
    if (f === 'terminal.png' && !(got[0]?.quality === 'magic' && got[2]?.quality === 'normal')) ok = false;
    console.log(`[ss14] ${f}: ${pass ? 'OK' : 'FALHOU'}`);
    ok &&= pass;
  }
  for (const [f, client, want] of [
    ['seal-flames.png', { x: 0, y: 0, width: 1919, height: 1079 }, { whisper: 'armament', minQuality: 'rare', at: [1208, 331] }],
    ['seal-wealth.png', { x: 1, y: 31, width: 1920, height: 1080 }, { whisper: 'wealth', minQuality: 'magic', at: [612, 281] }],
  ] as const) {
    const r = await readSeal(load(f), client);
    const fl = parseFlame(r.text);
    const near = !!r.pos && Math.hypot(r.pos.x - want.at[0], r.pos.y - want.at[1]) < 25;
    const pass = !!fl && 'whisper' in fl && fl.whisper === want.whisper && fl.minQuality === want.minQuality && near;
    console.log('[ss14] ' + f + ': ' + r.ms + ' ms, ícone ' + r.quality + ', ' + JSON.stringify(r.text) + ', Flame selecionada em ' + JSON.stringify(r.pos && [Math.round(r.pos.x), Math.round(r.pos.y)]) + ' → ' + (pass ? 'OK' : 'FALHOU'));
    ok &&= pass;
  }
  // --- clique: o ícone mais perto do cursor é a Flame clicada ---
  for (const [f, client, at] of [
    ['seal-flames.png', { x: 0, y: 0, width: 1919, height: 1079 }, [1208, 331]],
    ['seal-wealth.png', { x: 1, y: 31, width: 1920, height: 1080 }, [612, 281]],
    ['seal-wonder-crop.png', { x: 515 - 960, y: 380 - 540, width: 1920, height: 1080 }, [215, 270]],
  ] as const) {
    const fr = load(f);
    for (const [dx, dy] of [[0, 0], [18, 22], [-25, 30]]) {
      const p = flameNear(fr.bgra, fr.width, client, { x: at[0] + dx, y: at[1] + dy });
      const pass = !!p && Math.hypot(p.x - at[0], p.y - at[1]) < 25;
      if (!pass) console.log(`[clique] ${f} clique (${at[0] + dx},${at[1] + dy}) → ${JSON.stringify(p)} FALHOU`);
      ok &&= pass;
    }
  }
  console.log('[clique] Flame pelo cursor: ' + (ok ? 'OK' : 'FALHOU'));

  // --- janela mais alta (proporção ≈1,29, como a do amigo): interface do mesmo tamanho, centralizada ---
  const pad = (fr: Frame, client: { x: number; y: number; width: number; height: number }, W: number, Hh: number, scale = 1): Frame => {
    const inner = fr.image.crop(client);
    const sized = scale === 1 ? inner : inner.resize({ width: Math.round(client.width * scale), quality: 'best' });
    const sz = sized.getSize();
    const out = Buffer.alloc(W * Hh * 4);
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
    const src = sized.toBitmap();
    const ox = Math.round((W - sz.width) / 2);
    const oy = Math.round((Hh - sz.height) / 2);
    for (let y = 0; y < sz.height; y++) src.copy(out, ((y + oy) * W + ox) * 4, y * sz.width * 4, (y + 1) * sz.width * 4);
    const image = nativeImage.createFromBitmap(out, { width: W, height: Hh });
    return { image, bgra: out, width: W, height: Hh, method: 'synthetic' };
  };
  {
    const tall = pad(load('seal-flames.png'), { x: 0, y: 0, width: 1919, height: 1079 }, 1919, 1490);
    const client = { x: 0, y: 0, width: 1919, height: 1490 };
    const text = await readSealText(tall, client);
    const q = sealQuick(tall, client, undefined, { x: 1210, y: 331 + 205 });
    const pass = parseFlame(text)?.kind === 'guarantee' && !!q.pos && Math.abs(q.pos.y - (332 + 205)) < 25;
    console.log(`[janela alta] Flames: ${JSON.stringify(text.slice(0, 60))} pos ${JSON.stringify(q.pos)} → ${pass ? 'OK' : 'FALHOU'}`);
    ok &&= pass;
    const tallT = pad(load('terminal.png'), { x: 1, y: 31, width: 1920, height: 1080 }, 1920, 1490);
    const scanT = await readTerminal(tallT, { x: 0, y: 0, width: 1920, height: 1490 });
    const passT = scanT.reads.length === 3;
    console.log(`[janela alta] cartas: ${scanT.reads.length} lidas → ${passT ? 'OK' : 'FALHOU'}`);
    ok &&= passT;
  }
  // --- escala de interface menor (80%): calibra pelo botão Confirm ---
  {
    const small = pad(load('seal-flames.png'), { x: 0, y: 0, width: 1919, height: 1079 }, 1919, 1079, 0.8);
    const client = { x: 0, y: 0, width: 1919, height: 1079 };
    const unit = await calibrateSeal(small, client);
    const text = unit ? await readSealText(small, client, unit) : '';
    const pass = !!unit && Math.abs(unit - 0.8 * 1079) < 40 && parseFlame(text)?.kind === 'guarantee';
    console.log(`[escala 80%] U medido ${unit && Math.round(unit)} (esperado ~${Math.round(0.8 * 1079)}), texto ${JSON.stringify(text.slice(0, 50))} → ${pass ? 'OK' : 'FALHOU'}`);
    ok &&= pass;
  }

  const hud = await scanChoice(load('map-hud.png'), null);
  console.log(`[ss14] map-hud.png: ${hud.reads.length} cartas (esperado 0)`);
  return ok && hud.reads.length === 0;
}

async function real(out: string): Promise<void> {
  const g = findGameWindow();
  console.log('[game] janela:', JSON.stringify(g));
  if (!g) return;
  const frame = await captureGame(g);
  if (!frame) return console.log('[game] captura falhou');
  writeFileSync(join(out, 'game.png'), frame.image.toPNG());
  const t0 = Date.now();
  const lines = await recognize(ocrImage(frame));
  console.log(`[game] frame ${frame.width}x${frame.height} via ${frame.method}, OCR ${Date.now() - t0} ms, ${lines.length} linhas`);
  writeFileSync(join(out, 'game.json'), JSON.stringify(lines, null, 2));
}

app.whenReady().then(async () => {
  const out = join(process.cwd(), 'out', 'selftest');
  mkdirSync(out, { recursive: true });
  initCapture(join(__dirname, 'preload.js'), join(__dirname, 'renderer'));
  await new Promise((r) => setTimeout(r, 800));
  let ok = false;
  try {
    ok = await synthetic(out);
    ok = (await realFixtures()) && ok;
    await real(out);
  } catch (err) {
    console.error(err);
  }
  console.log(ok ? 'SELFTEST OK' : 'SELFTEST FALHOU');
  await stopOcr();
  app.exit(ok ? 0 : 1);
});
