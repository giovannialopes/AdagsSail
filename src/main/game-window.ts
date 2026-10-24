// Localiza a janela do jogo via Win32 (só leitura: título, retângulo, foco). Nada de input nem memória.
import koffi from 'koffi';

// O título real tem espaços no fim ("Torchlight: Infinite  ").
export const GAME_TITLE = /^Torchlight: Infinite\s*$/;

export interface GameWindow {
  hwnd: number;
  rect: { x: number; y: number; width: number; height: number }; // pixels físicos
  // Área útil (sem barra de título/bordas), relativa ao canto de `rect`.
  client: { x: number; y: number; width: number; height: number };
  focused: boolean;
  minimized: boolean;
}

const RECT = koffi.struct('AdagsRECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
koffi.struct('AdagsPOINT', { x: 'int32', y: 'int32' });

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const EnumProc = koffi.proto('bool __stdcall AdagsEnumProc(intptr_t hwnd, intptr_t lparam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(AdagsEnumProc *cb, intptr_t lparam)');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, _Out_ uint16_t *buf, int max)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)');
const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
const IsIconic = user32.func('bool __stdcall IsIconic(intptr_t hwnd)');
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ AdagsRECT *rect)');
const GetClientRect = user32.func('bool __stdcall GetClientRect(intptr_t hwnd, _Out_ AdagsRECT *rect)');
const ClientToScreen = user32.func('bool __stdcall ClientToScreen(intptr_t hwnd, _Inout_ AdagsPOINT *pt)');
const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ AdagsPOINT *pt)');
const DwmGetWindowAttribute = dwmapi.func(
  'int32 __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32 attr, _Out_ AdagsRECT *value, uint32 size)',
);

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

function windowTitle(hwnd: number): string {
  const buf = new Uint16Array(256);
  const n = GetWindowTextW(hwnd, buf, buf.length);
  return String.fromCharCode(...buf.subarray(0, n));
}

export function findGameHwnd(): number {
  let found = 0;
  EnumWindows((h: number | bigint) => {
    const hwnd = Number(h);
    if (IsWindowVisible(hwnd) && GAME_TITLE.test(windowTitle(hwnd))) {
      found = hwnd;
      return false;
    }
    return true;
  }, 0);
  return found;
}

// Posição do cursor na tela (pixels físicos). Só leitura — usada para saber em qual Flame o jogador
// acabou de clicar.
export function cursorPos(): { x: number; y: number } {
  const p = { x: 0, y: 0 };
  GetCursorPos(p);
  return p;
}

export function findGameWindow(): GameWindow | null {
  const hwnd = findGameHwnd();
  if (!hwnd) return null;
  const r = { left: 0, top: 0, right: 0, bottom: 0 };
  // Bounds sem a sombra invisível do Windows 10/11; GetWindowRect como alternativa.
  if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, r, koffi.sizeof(RECT)) !== 0) {
    GetWindowRect(hwnd, r);
  }
  const c = { left: 0, top: 0, right: 0, bottom: 0 };
  const origin = { x: 0, y: 0 };
  GetClientRect(hwnd, c);
  ClientToScreen(hwnd, origin);
  return {
    hwnd,
    rect: { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top },
    client: { x: origin.x - r.left, y: origin.y - r.top, width: c.right - c.left, height: c.bottom - c.top },
    focused: Number(GetForegroundWindow()) === hwnd,
    minimized: IsIconic(hwnd),
  };
}
