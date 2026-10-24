// Captura da janela do jogo. Ordem:
//  1) getDisplayMedia numa janela oculta (Windows Graphics Capture: pega DirectX mesmo atrás de outras janelas);
//  2) thumbnail do desktopCapturer (costuma vir preta em jogos, mas é barata);
//  3) print do monitor recortado no retângulo do jogo (só funciona com o jogo visível).
import { BrowserWindow, desktopCapturer, ipcMain, nativeImage, screen, session, type NativeImage } from 'electron';
import { join } from 'node:path';
import { CAPTURE_CHANNELS } from '../shared/ipc';
import { GAME_TITLE, type GameWindow } from './game-window';

export interface Frame {
  image: NativeImage;
  bgra: Buffer; // toBitmap() no Windows é BGRA
  width: number;
  height: number;
  method: 'stream' | 'thumbnail' | 'screen' | 'synthetic';
}

let worker: BrowserWindow | null = null;
let pendingSource: Electron.DesktopCapturerSource | null = null;
let seq = 0;
const waiting = new Map<number, (r: { width?: number; height?: number; rgba?: ArrayBuffer; error?: string }) => void>();

export function initCapture(preload: string, rendererDir: string): void {
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    if (pendingSource) callback({ video: pendingSource });
    else callback({});
  });
  ipcMain.on(CAPTURE_CHANNELS.result, (_e, r) => {
    waiting.get(r.id)?.(r);
    waiting.delete(r.id);
  });
  worker = new BrowserWindow({ show: false, width: 200, height: 100, webPreferences: { preload, backgroundThrottling: false } });
  worker.loadFile(join(rendererDir, 'capture.html'));
}

function fromBitmap(bgra: Buffer, width: number, height: number, method: Frame['method']): Frame {
  return { image: nativeImage.createFromBitmap(bgra, { width, height }), bgra, width, height, method };
}

function fromImage(image: NativeImage, method: Frame['method']): Frame {
  const { width, height } = image.getSize();
  return { image, bgra: image.toBitmap(), width, height, method };
}

// Olha só o miolo (80%) do frame: a borda da janela aparece mesmo quando o conteúdo vem preto.
export function isBlank(f: Frame): boolean {
  if (!f.width || !f.height) return true;
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(f.height * 0.1); y < f.height * 0.9; y += 17) {
    for (let x = Math.floor(f.width * 0.1); x < f.width * 0.9; x += 23) {
      const i = (y * f.width + x) * 4;
      sum += f.bgra[i] + f.bgra[i + 1] + f.bgra[i + 2];
      n++;
    }
  }
  return sum / Math.max(n, 1) < 9;
}

async function windowSource(game: GameWindow, thumb: { width: number; height: number }) {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: thumb, fetchWindowIcons: false });
  return sources.find((s) => s.id.startsWith(`window:${game.hwnd}:`)) ?? sources.find((s) => GAME_TITLE.test(s.name)) ?? null;
}

// Fonte do desktopCapturer guardada por janela: procurar a fonte custa ~100 ms e o stream na janela
// oculta fica aberto entre capturas (só reabre se a janela do jogo mudar).
let sourceHwnd = 0;

async function captureStream(game: GameWindow): Promise<Frame | null> {
  if (!worker) return null;
  if (!pendingSource || sourceHwnd !== game.hwnd) {
    const src = await windowSource(game, { width: 1, height: 1 });
    if (!src) return null;
    pendingSource = src;
    sourceHwnd = game.hwnd;
  }
  const id = ++seq;
  const r = await new Promise<{ width?: number; height?: number; rgba?: ArrayBuffer; error?: string }>((resolve) => {
    waiting.set(id, resolve);
    worker!.webContents.send(CAPTURE_CHANNELS.request, { id, key: String(game.hwnd) });
    setTimeout(() => {
      if (waiting.delete(id)) resolve({ error: 'timeout' });
    }, 5000);
  });
  if (!r.rgba || !r.width || !r.height) {
    pendingSource = null; // fonte pode ter mudado: procura de novo na próxima
    return null;
  }
  const px = Buffer.from(r.rgba);
  for (let i = 0; i < px.length; i += 4) {
    const red = px[i];
    px[i] = px[i + 2];
    px[i + 2] = red;
  }
  return fromBitmap(px, r.width, r.height, 'stream');
}

async function captureThumbnail(game: GameWindow): Promise<Frame | null> {
  const src = await windowSource(game, { width: game.rect.width, height: game.rect.height });
  if (!src || src.thumbnail.isEmpty()) return null;
  return fromImage(src.thumbnail, 'thumbnail');
}

async function captureScreen(game: GameWindow): Promise<Frame | null> {
  const dip = screen.screenToDipRect(null, game.rect);
  const display = screen.getDisplayMatching(dip);
  const scale = display.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: display.size.width * scale, height: display.size.height * scale },
  });
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!src) return null;
  const size = src.thumbnail.getSize();
  const x = Math.max(0, game.rect.x - Math.round(display.bounds.x * scale));
  const y = Math.max(0, game.rect.y - Math.round(display.bounds.y * scale));
  const crop = { x, y, width: Math.min(game.rect.width, size.width - x), height: Math.min(game.rect.height, size.height - y) };
  return fromImage(src.thumbnail.crop(crop), 'screen');
}

export async function captureGame(game: GameWindow): Promise<Frame | null> {
  for (const method of [captureStream, captureThumbnail]) {
    const f = await method(game).catch(() => null);
    if (f && !isBlank(f)) return f;
  }
  // O print do monitor só vale se o jogo estiver na frente (senão captura outra janela).
  if (!game.focused) return null;
  const f = await captureScreen(game).catch(() => null);
  return f && !isBlank(f) ? f : null;
}

// Texto claro sobre fundo escuro → cinza invertido (o Tesseract lê melhor preto no branco).
// `stretch` estica o contraste (50..160): ajuda no texto cinza apagado das cartas Normal, mas
// pode apagar títulos azuis — por isso o leitor tenta as duas versões.
export function ocrImage(f: Frame, stretch = false): Buffer {
  const out = Buffer.alloc(f.bgra.length);
  for (let i = 0; i < f.bgra.length; i += 4) {
    const lum = 0.114 * f.bgra[i] + 0.587 * f.bgra[i + 1] + 0.299 * f.bgra[i + 2];
    const v = stretch ? ((lum - 50) * 255) / 110 : lum;
    const g = 255 - Math.max(0, Math.min(255, Math.round(v)));
    out[i] = out[i + 1] = out[i + 2] = g;
    out[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(out, { width: f.width, height: f.height }).toPNG();
}
