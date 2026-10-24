import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RELATIVE = [
  ['UE_game', 'TorchLight', 'Saved', 'Logs', 'UE_game.log'],
  ['UE_Game', 'Torchlight', 'Saved', 'Logs', 'UE_game.log'],
  ['Game', 'UE_game', 'Torchlight', 'Saved', 'Logs', 'UE_game.log'],
];

export function parseLibraryFolders(vdf: string): string[] {
  return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'));
}

export function logCandidates(steamLibraries: string[]): string[] {
  const roots = [
    ...steamLibraries.map((lib) => join(lib, 'steamapps', 'common', 'Torchlight Infinite')),
    'C:\\Program Files (x86)\\Torchlight Infinite',
    'C:\\Program Files\\Torchlight Infinite',
  ];
  return roots.flatMap((root) => RELATIVE.map((rel) => join(root, ...rel)));
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

async function steamLibraries(): Promise<string[]> {
  const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
  const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(out);
  const steam = m ? m[1].trim().replace(/\//g, '\\') : 'C:\\Program Files (x86)\\Steam';
  const vdf = join(steam, 'steamapps', 'libraryfolders.vdf');
  const libs = existsSync(vdf) ? parseLibraryFolders(readFileSync(vdf, 'utf8')) : [];
  return [...new Set([steam, ...libs])];
}

async function fromProcess(): Promise<string | null> {
  const out = await run('powershell', [
    '-NoProfile',
    '-Command',
    "(Get-CimInstance Win32_Process -Filter \"Name='torchlight_infinite.exe'\").ExecutablePath",
  ]);
  const exe = out.trim().split(/\r?\n/)[0];
  if (!exe) return null;
  // ...\UE_game\Binaries\Win64\torchlight_infinite.exe → ...\UE_game\TorchLight\Saved\Logs\UE_game.log
  const ueGame = exe.split('\\').slice(0, -3).join('\\');
  const file = join(ueGame, 'TorchLight', 'Saved', 'Logs', 'UE_game.log');
  return existsSync(file) ? file : null;
}

export async function findLogPath(configured?: string): Promise<string | null> {
  if (configured && existsSync(configured)) return configured;
  const proc = await fromProcess();
  if (proc) return proc;
  for (const file of logCandidates(await steamLibraries())) if (existsSync(file)) return file;
  return null;
}
