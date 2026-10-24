// Janela oculta: pega frames da janela do jogo via getDisplayMedia (Windows Graphics Capture,
// funciona com DirectX). A fonte é escolhida no main pelo setDisplayMediaRequestHandler.
// O stream fica ABERTO entre pedidos (abrir custa ~300 ms; pegar um frame de um stream aberto,
// ~20 ms) e fecha sozinho depois de um tempo sem uso.
import { CAPTURE_CHANNELS } from '../shared/ipc';
import { bridge } from './common';

declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  grabFrame(): Promise<ImageBitmap>;
}

const IDLE_MS = 30 * 60_000;

let stream: MediaStream | null = null;
let capture: ImageCapture | null = null;
let streamKey: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function close(): void {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  capture = null;
  streamKey = null;
}

async function open(key: string): Promise<void> {
  close();
  stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30, width: { ideal: 7680 }, height: { ideal: 4320 } },
    audio: false,
  });
  capture = new ImageCapture(stream.getVideoTracks()[0]);
  streamKey = key;
  // O primeiro frame às vezes vem vazio enquanto o capturador inicializa.
  await capture.grabFrame().catch(() => null);
  await new Promise((r) => setTimeout(r, 80));
}

async function grab(key: string): Promise<{ width: number; height: number; rgba: ArrayBuffer } | { error: string }> {
  try {
    const live = stream?.getVideoTracks()[0]?.readyState === 'live';
    if (!capture || !live || streamKey !== key) await open(key);
    const bmp = await capture!.grabFrame();
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, rgba: data.buffer as ArrayBuffer };
  } catch (err) {
    close();
    return { error: (err as Error).message };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(close, IDLE_MS);
  }
}

bridge.on(CAPTURE_CHANNELS.request, async (req) => {
  const { id, key } = req as { id: number; key: string };
  bridge.send(CAPTURE_CHANNELS.result, { id, ...(await grab(key)) });
});
