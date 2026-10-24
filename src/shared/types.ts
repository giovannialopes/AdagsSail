export interface PriceEntry {
  fe: number;
  p10: number;
  p90: number;
  devices: number;
  bucket: string;
  fetchedAt: number;
}

export type PriceMap = Record<number, PriceEntry>;
