import type { PriceEntry } from './types';

export const TITRACK_SEASON = 1601; // SS14

export function titrackUrl(id: number): string {
  return `https://titrack.ninja/item/${id}?season=${TITRACK_SEASON}`;
}

// A página (Next.js RSC) embute o histórico horário como JSON escapado (\"campo\").
const BUCKET_RE =
  /\{\\?"hour_bucket\\?":\\?"([^"\\]+)\\?",\\?"price_fe_median\\?":([\d.eE-]+),\\?"price_fe_p10\\?":([\d.eE-]+),\\?"price_fe_p90\\?":([\d.eE-]+),\\?"submission_count\\?":\d+,\\?"unique_devices\\?":(\d+)\}/g;

export function parseTitrackHtml(html: string): Omit<PriceEntry, 'fetchedAt'> | null {
  let best: Omit<PriceEntry, 'fetchedAt'> | null = null;
  for (const m of html.matchAll(BUCKET_RE)) {
    const entry = {
      bucket: m[1],
      fe: Number(m[2]),
      p10: Number(m[3]),
      p90: Number(m[4]),
      devices: Number(m[5]),
    };
    if (!Number.isFinite(entry.fe)) continue;
    if (!best || Date.parse(entry.bucket) >= Date.parse(best.bucket)) best = entry;
  }
  return best;
}
