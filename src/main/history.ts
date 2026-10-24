// Histórico permanente do Blacksail: cada tela de cartas (o que foi lido e o que foi escolhido),
// cada tela de Flames e cada baú, em %APPDATA%/AdagsSail/history/<dia>.jsonl, mais um print JPEG
// de cada tela. Serve para ajustar a leitura e calibrar o valor das cartas com dados reais.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NativeImage } from 'electron';

export type HistoryEvent =
  | { type: 'choice'; at: string; round: number; cards: unknown[]; picked: { rarity: number; key: string | null } | null; frame?: string }
  | { type: 'flames'; at: string; flames: unknown[]; frame?: string }
  | { type: 'chest'; at: string; round: number; drops: Record<string, number>; dropsById?: Record<number, number>; chestFE?: number; picks: unknown[] }
  | { type: 'note'; at: string; text: string };

export class History {
  readonly dir: string;
  readonly framesDir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'history');
    this.framesDir = join(this.dir, 'frames');
    mkdirSync(this.framesDir, { recursive: true });
  }

  private file(): string {
    return join(this.dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  }

  append(ev: HistoryEvent): void {
    try {
      appendFileSync(this.file(), JSON.stringify(ev) + '\n');
    } catch {
      // histórico é melhor esforço: nunca derruba o app
    }
  }

  // JPEG (~200 KB) em vez de PNG (~1,5 MB) para guardar muitas telas.
  saveFrame(image: NativeImage, name: string): string | undefined {
    try {
      const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.jpg`;
      writeFileSync(join(this.framesDir, file), image.toJPEG(80));
      return file;
    } catch {
      return undefined;
    }
  }

  // Todos os baús já registrados (para calibrar a mistura de Thread/Invitation etc.).
  chests(): { drops: Record<string, number> }[] {
    const out: { drops: Record<string, number> }[] = [];
    try {
      for (const f of readdirSync(this.dir).filter((x) => x.endsWith('.jsonl'))) {
        for (const line of readFileSync(join(this.dir, f), 'utf8').split('\n')) {
          if (!line.includes('"type":"chest"')) continue;
          try {
            out.push(JSON.parse(line));
          } catch {
            // linha truncada
          }
        }
      }
    } catch {
      // sem histórico ainda
    }
    return out;
  }
}
