import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };

await build({
  ...common,
  entryPoints: ['src/main/main.ts'],
  outfile: 'out/main.js',
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'koffi', 'tesseract.js'],
});
await build({
  ...common,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'out/preload.js',
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: ['src/renderer/overlay.ts', 'src/renderer/panel.ts', 'src/renderer/capture.ts'],
  outdir: 'out/renderer',
  platform: 'browser',
  format: 'iife',
});

mkdirSync('out/renderer', { recursive: true });
for (const f of ['overlay.html', 'overlay.css', 'panel.html', 'panel.css', 'capture.html']) {
  cpSync(`src/renderer/${f}`, `out/renderer/${f}`);
}

if (process.argv.includes('--selftest')) {
  await build({
    ...common,
    entryPoints: ['test/e2e/selftest.ts', 'test/e2e/watch.ts'],
    outdir: 'out',
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'koffi', 'tesseract.js'],
  });
}
