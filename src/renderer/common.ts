export interface AdagsBridge {
  on(channel: string, cb: (data: unknown) => void): void;
  send(channel: string, data?: unknown): void;
}

export const bridge = (window as unknown as { adags: AdagsBridge }).adags;

export function fmtFE(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const TYPE_LABEL: Record<string, string> = {
  wealth: 'Whisper of Wealth',
  wonder: 'Whisper of Wonder',
  armament: 'Whisper of Armament',
  boss: 'Boss Whisper',
  unknown: 'Whisper ?',
};

export const PART_LABEL: Record<string, string> = {
  scrap: 'Scrap',
  thread: 'Thread',
  hero: 'Hero Mem.',
  invitation: 'Invitation',
};
