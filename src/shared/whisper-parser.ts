// Converte o texto (OCR) de uma carta de Seal Whisper em afixos estruturados.
// Formatos baseados nas tabelas SS14 do tlidb (Whisper of Wealth/Wonder/Armament, Boss Whisper).

export type WhisperType = 'wealth' | 'wonder' | 'armament' | 'boss' | 'unknown';
export type AffixItem = 'scrap' | 'thread' | 'hero' | 'invitation';

export type Affix =
  | { kind: 'baseQty' | 'treasureQty' | 'rarity'; pct: number; raw: string }
  | { kind: 'appear' | 'itemQty'; item: AffixItem; pct: number; raw: string }
  | { kind: 'flat'; item: AffixItem; n: number; raw: string }
  | { kind: 'chanceFlat'; item: AffixItem; pct: number; n: number; raw: string }
  | { kind: 'multiply'; item: AffixItem; pct: number; times: number; raw: string };

export function normalizeOcr(s: string): string {
  return s
    .replace(/[°o]\s*\/\s*[o0]/g, '%')
    .replace(/(\d)\s*°/g, '$1%')
    .replace(/\b[0-9OlI]*[0-9][0-9OlI]*\b/g, (tok) => tok.replace(/O/g, '0').replace(/[lI]/g, '1'))
    // número grande e branco no meio da frase às vezes vira letra: "for B additional" = 8
    .replace(/\b(?:[fFtT][o0]r|ror)\s+([0-9B&]{1,3})\s+additional/g, (_m, n: string) => `for ${n.replace(/[B&]/g, '8')} additional`)
    .replace(/chance\s+(?:ror|tor|f0r)\b/gi, 'chance for')
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/\+\s+(\d)/g, '+$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function detectType(title: string): WhisperType {
  const t = normalizeOcr(title).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
  if (/boss\s*whisper/.test(t)) return 'boss';
  if (/whisper\s*of\s*wealth/.test(t)) return 'wealth';
  if (/whisper\s*of\s*wonder/.test(t)) return 'wonder';
  if (/whisper\s*of\s*armament/.test(t)) return 'armament';
  return 'unknown';
}

// Linha de título = só o nome do Whisper (descrições de Flame citam "Whisper of X" no meio da frase).
export function titleType(line: string): WhisperType {
  const t = detectType(line);
  if (t === 'unknown') return t;
  const rest = normalizeOcr(line)
    .replace(/boss\s*whisper|whisper\s*[o0]f\s*(wea[l1]th|wonder|armament)/i, '')
    .replace(/[^a-z0-9]/gi, '');
  return rest.length <= 4 ? t : 'unknown';
}

export const TITLE_RE = /(boss\s*whisper|whisper\s*[o0]f\s*(wea[l1]th|wonder|armament))/i;

const SCRAP = String.raw`Memory\s*Scraps?(?:\(s\))?`;
const THREAD = String.raw`Memory\s*Threads?(?:\(s\))?`;
const HERO = String.raw`Hero\s*Memor(?:y|ies)(?:\(ies\))?`;
const INV = String.raw`Void\s*Sea\s*Invitations?(?:\(s\))?`;
const ITEM = `(${SCRAP}|${THREAD}|${HERO}|${INV})`;
// O "%" do jogo é pequeno e o OCR às vezes perde ou troca por dígito: fica opcional; os números
// impossíveis são corrigidos por plausible().
const PCT = String.raw`\+?(\d+)\s*%?`;
const TREASURE = String.raw`Void\s*Sea\s*Treasures?`;
const S = String.raw`\s*`;

function itemOf(s: string): AffixItem {
  if (/scrap/i.test(s)) return 'scrap';
  if (/thread/i.test(s)) return 'thread';
  if (/hero/i.test(s)) return 'hero';
  return 'invitation';
}

type Rule = { re: RegExp; build: (m: RegExpExecArray) => Affix };

const rx = (src: string) => new RegExp(src, 'gi');

// Ordem importa: padrões mais específicos primeiro; o trecho casado é consumido.
const RULES: Rule[] = [
  {
    re: rx(`${PCT}${S}chance${S}for${S}${ITEM}${S}dropped${S}from${S}${TREASURE}${S}to${S}be${S}multiplied${S}by${S}(\\d+)(?:${S}times?(?:\\(s\\))?)?`),
    build: (m) => ({ kind: 'multiply', pct: +m[1], item: itemOf(m[2]), times: +m[3], raw: m[0] }),
  },
  {
    re: rx(`(\\d+)\\s*%?${S}chance${S}for${S}(\\d+)${S}additional${S}${ITEM}(?:${S}to${S}drop${S}from${S}${TREASURE})?`),
    build: (m) => ({ kind: 'chanceFlat', pct: +m[1], n: +m[2], item: itemOf(m[3]), raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}chance${S}for${S}(?:an?${S})?(?:additional${S})?(${INV})${S}to${S}drop(?:${S}from${S}${TREASURE})?`),
    build: (m) => ({ kind: 'chanceFlat', pct: +m[1], n: 1, item: 'invitation', raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}chance${S}for${S}${ITEM}${S}to${S}appear(?:${S}among${S}base${S}${TREASURE}${S}drops)?`),
    build: (m) => ({ kind: 'appear', pct: +m[1], item: itemOf(m[2]), raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}additional${S}${ITEM}${S}Drop${S}Quantity(?:${S}in${S}base${S}${TREASURE}${S}drops)?`),
    build: (m) => ({ kind: 'itemQty', pct: +m[1], item: itemOf(m[2]), raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}${TREASURE}${S}Base${S}Drop${S}Quantity`),
    build: (m) => ({ kind: 'baseQty', pct: +m[1], raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}${TREASURE}${S}Drop${S}Quantity`),
    build: (m) => ({ kind: 'treasureQty', pct: +m[1], raw: m[0] }),
  },
  {
    re: rx(`${PCT}${S}${TREASURE}${S}Drop${S}Rarity`),
    build: (m) => ({ kind: 'rarity', pct: +m[1], raw: m[0] }),
  },
  {
    re: rx(`${TREASURE}${S}drops?${S}(\\d+)${S}additional${S}${ITEM}`),
    build: (m) => ({ kind: 'flat', n: +m[1], item: itemOf(m[2]), raw: m[0] }),
  },
  {
    re: rx(`(\\d+)${S}additional${S}${ITEM}${S}drops?(?:${S}from${S}${TREASURE})?`),
    build: (m) => ({ kind: 'flat', n: +m[1], item: itemOf(m[2]), raw: m[0] }),
  },
];

// Valores das tabelas SS14 do tlidb (Normal/Magic/Rare/Legendary e o bloco dobrado).
const KNOWN: Record<string, number[]> = {
  baseQty: [9, 14, 18, 28, 36, 72],
  treasureQty: [14, 21, 28, 42, 56, 112],
  rarity: [25, 37, 49, 74, 98, 196],
  'multiply:scrap': [21, 32, 42, 64, 84],
  'multiply:thread': [21, 32, 42, 64, 84],
  'appear:scrap': [14, 21, 28, 42, 56, 112],
  'appear:thread': [35, 53, 70, 106, 140, 280],
  'appear:hero': [28, 42, 56, 84, 112, 224],
  'itemQty:scrap': [35, 53, 70, 105, 140, 280],
  'itemQty:thread': [21, 32, 42, 64, 84, 168],
  'itemQty:hero': [21, 32, 42, 64, 84, 168],
};

// Se o número é maior que qualquer valor possível, o OCR provavelmente leu o "%" como dígito:
// tenta tirar um dígito (primeiro o último) até cair num valor da tabela.
function plausible(value: number, table: number[] | undefined): number {
  if (!table || value <= Math.max(...table)) return value;
  const digits = String(value);
  const order = [digits.length - 1, ...Array.from({ length: digits.length - 1 }, (_, i) => i)];
  for (const i of order) {
    const candidate = Number(digits.slice(0, i) + digits.slice(i + 1));
    if (table.includes(candidate)) return candidate;
  }
  return value;
}

function fixAffix(a: Affix): Affix {
  if (a.kind === 'baseQty' || a.kind === 'treasureQty' || a.kind === 'rarity') return { ...a, pct: plausible(a.pct, KNOWN[a.kind]) };
  if (a.kind === 'appear' || a.kind === 'itemQty' || a.kind === 'multiply') return { ...a, pct: plausible(a.pct, KNOWN[`${a.kind}:${a.item}`]) };
  return a;
}

export function parseAffixes(text: string): { affixes: Affix[]; unknown: string[] } {
  const lines = text.split(/\r?\n/).map(normalizeOcr).filter(Boolean);
  const joined = lines.join(' ');
  const consumed = new Uint8Array(joined.length);
  const found: { at: number; affix: Affix }[] = [];

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(joined))) {
      const start = m.index;
      const end = start + m[0].length;
      if (consumed.subarray(start, end).some((c) => c)) continue;
      consumed.fill(1, start, end);
      found.push({ at: start, affix: rule.build(m) });
    }
  }

  const unknown: string[] = [];
  let offset = 0;
  for (const line of lines) {
    const covered = consumed.subarray(offset, offset + line.length).reduce((a, c) => a + c, 0);
    if (/\d/.test(line) && !TITLE_RE.test(line) && covered < line.length / 2) unknown.push(line);
    offset += line.length + 1;
  }

  found.sort((a, b) => a.at - b.at);
  return { affixes: found.map((f) => fixAffix(f.affix)), unknown };
}
