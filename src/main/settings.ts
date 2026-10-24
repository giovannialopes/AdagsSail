import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Goal } from '../shared/goals';
import { DEFAULT_BASELINE, type Baseline } from '../shared/valuation';

// v2: baseline recalibrada com os baús reais (só Thread Epic, só Invitation Craving).
// v3: Boss Whisper modelado como chance de Invitation.
// v4: baú base medido + Boss Whisper com os valores reais (5/10/20/40%).
// v5: Drop Rarity passa a valer para Hero Memories (heroRarityFactor), não para Threads.
export const SETTINGS_VERSION = 5;

export interface Settings {
  settingsVersion: number;
  logPath?: string;
  baseline: Baseline;
  hotkeys: { toggle: string; analyze: string; calibrate: string; reset: string };
  // Atraso entre o gatilho do log e a captura (a animação da carta precisa terminar).
  captureDelayMs: number;
  panelBounds?: { x: number; y: number };
  goal: Goal; // prioridade de farm escolhida no painel
}

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  baseline: DEFAULT_BASELINE,
  hotkeys: { toggle: 'Control+Alt+O', analyze: 'Control+Alt+W', calibrate: 'Control+Alt+K', reset: 'Control+Alt+R' },
  captureDelayMs: 350,
  goal: 'fe',
};

export function loadSettings(file: string): Settings {
  let raw: Partial<Settings> = {};
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // primeiro uso ou arquivo inválido: grava os padrões para o usuário poder editar
  }
  // Versão antiga: a baseline gravada eram só os padrões antigos — troca pelos novos.
  const outdated = (raw.settingsVersion ?? 1) < SETTINGS_VERSION;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    settingsVersion: SETTINGS_VERSION,
    baseline: outdated ? DEFAULT_BASELINE : { ...DEFAULT_BASELINE, ...raw.baseline },
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...raw.hotkeys },
  };
  saveSettings(file, settings);
  return settings;
}

export function saveSettings(file: string, settings: Settings): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2));
}
