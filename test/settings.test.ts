import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSettings } from '../src/main/settings';

describe('loadSettings', () => {
  it('migrates v1 files to the recalibrated baseline but keeps logPath', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'adags-')), 'settings.json');
    writeFileSync(f, JSON.stringify({ logPath: 'X:/UE_game.log', baseline: { threadMix: { magic: 0.55, rare: 0.35, epic: 0.1 } } }));
    const s = loadSettings(f);
    expect(s.logPath).toBe('X:/UE_game.log');
    expect(s.baseline.threadMix.epic).toBe(1);
    expect(JSON.parse(readFileSync(f, 'utf8')).settingsVersion).toBe(5);
  });

  it('keeps user edits on current version', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'adags-')), 'settings.json');
    writeFileSync(f, JSON.stringify({ settingsVersion: 5, baseline: { heroMemoryFE: 1.5 } }));
    expect(loadSettings(f).baseline.heroMemoryFE).toBe(1.5);
  });
});
