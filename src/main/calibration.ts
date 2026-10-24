import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame } from './capture';

export interface CalibrationData {
  frame: Frame | null;
  detect: unknown;
  logTail: string;
}

// Salva o que for preciso para afinar a leitura das cartas da SS14.
export function saveCalibration(baseDir: string, data: CalibrationData): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(baseDir, stamp);
  mkdirSync(dir, { recursive: true });
  if (data.frame) writeFileSync(join(dir, 'frame.png'), data.frame.image.toPNG());
  writeFileSync(join(dir, 'detect.json'), JSON.stringify(data.detect, null, 2));
  writeFileSync(join(dir, 'log-tail.txt'), data.logTail);
  return dir;
}
