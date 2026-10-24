// OCR local (tesseract.js em Node). O modelo eng vem de @tesseract.js-data/eng — nada é baixado da internet.
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import type { OcrLine } from '../shared/layout';

const req = createRequire(__filename);
type Tesseract = typeof import('tesseract.js');
type Worker = Awaited<ReturnType<Tesseract['createWorker']>>;

// Empacotado, node_modules fica fora do asar (worker_threads e o .wasm precisam de arquivos reais).
const unpacked = (p: string) => p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);

function langDir(): string {
  return join(dirname(unpacked(req.resolve('@tesseract.js-data/eng/package.json'))), '4.0.0_best_int');
}

// 'sparse' (PSM 11): linhas soltas em qualquer lugar da tela. 'block' (PSM 6): recorte de uma carta.
export type OcrMode = 'sparse' | 'block';

const workers: Partial<Record<OcrMode, Promise<Worker>>> = {};

async function getWorker(mode: OcrMode): Promise<Worker> {
  workers[mode] ??= (async () => {
    const T: Tesseract = req(unpacked(req.resolve('tesseract.js')));
    const w = await T.createWorker('eng', T.OEM.LSTM_ONLY, {
      langPath: langDir(),
      gzip: true,
      cacheMethod: 'none',
    });
    await w.setParameters({
      tessedit_pageseg_mode: mode === 'sparse' ? T.PSM.SPARSE_TEXT : T.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    return w;
  })();
  return workers[mode]!;
}

export async function recognize(png: Buffer, mode: OcrMode = 'sparse'): Promise<OcrLine[]> {
  const w = await getWorker(mode);
  const { data } = await w.recognize(png, {}, { blocks: true, text: false });
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const par of block.paragraphs) {
      for (const line of par.lines) {
        const text = line.text.replace(/\s+/g, ' ').trim();
        if (text.length >= 2) lines.push({ text, conf: line.confidence, bbox: line.bbox });
      }
    }
  }
  return lines;
}

export async function stopOcr(): Promise<void> {
  for (const mode of Object.keys(workers) as OcrMode[]) {
    await (await workers[mode])?.terminate();
    delete workers[mode];
  }
}
