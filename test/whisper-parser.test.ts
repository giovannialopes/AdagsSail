import { describe, expect, it } from 'vitest';
import { detectType, normalizeOcr, parseAffixes } from '../src/shared/whisper-parser';

describe('detectType', () => {
  it('recognizes the four Seal Whisper titles', () => {
    expect(detectType('Whisper of Wealth')).toBe('wealth');
    expect(detectType('Whisper of Wonder')).toBe('wonder');
    expect(detectType('Whisper of Armament')).toBe('armament');
    expect(detectType('Boss Whisper')).toBe('boss');
    expect(detectType('Whisper 0f Wea1th')).toBe('wealth');
    expect(detectType('Void Sea Treasure')).toBe('unknown');
  });
});

describe('normalizeOcr', () => {
  it('fixes digits and percent signs', () => {
    expect(normalizeOcr('+3O % chance')).toBe('+30% chance');
    expect(normalizeOcr('drop l9 additional')).toBe('drop 19 additional');
    expect(normalizeOcr('+56 °/o Void')).toBe('+56% Void');
  });
});

describe('parseAffixes (textos SS14 do tlidb)', () => {
  it('Whisper of Wealth', () => {
    const text = [
      '+36 % Void Sea Treasure Base Drop Quantity',
      '+ 56 % chance for Memory Scraps to appear among base Void Sea Treasure drops',
      '+ 140 % additional Memory Scrap Drop Quantity in base Void Sea Treasure drops',
      'Void Sea Treasures drop 39 additional Memory Scrap(s)',
      '20 % chance for 194 additional Memory Scrap(s) to drop from Void Sea Treasures',
      '+ 84 % additional Memory Thread Drop Quantity in base Void Sea Treasure drops',
      'Void Sea Treasures drop 2 additional Memory Thread(s)',
      '20 % chance for 10 additional Memory Thread(s) to drop from Void Sea Treasures',
    ].join('\n');
    const { affixes, unknown } = parseAffixes(text);
    expect(unknown).toEqual([]);
    expect(affixes.map((a) => a.kind)).toEqual([
      'baseQty', 'appear', 'itemQty', 'flat', 'chanceFlat', 'itemQty', 'flat', 'chanceFlat',
    ]);
    expect(affixes[1]).toMatchObject({ kind: 'appear', item: 'scrap', pct: 56 });
    expect(affixes[3]).toMatchObject({ kind: 'flat', item: 'scrap', n: 39 });
    expect(affixes[4]).toMatchObject({ kind: 'chanceFlat', item: 'scrap', pct: 20, n: 194 });
    expect(affixes[6]).toMatchObject({ kind: 'flat', item: 'thread', n: 2 });
  });

  it('Whisper of Wonder', () => {
    const text = [
      '+72 % Void Sea Treasure Base Drop Quantity',
      '+ 112 % Void Sea Treasure Drop Quantity',
      '+196 % Void Sea Treasure Drop Rarity',
      '+84 % chance for Memory Scraps dropped from Void Sea Treasures to be multiplied by 3 time(s)',
      '+84 % chance for Memory Threads dropped from Void Sea Treasures to be multiplied by 3 time(s)',
    ].join('\n');
    const { affixes, unknown } = parseAffixes(text);
    expect(unknown).toEqual([]);
    expect(affixes).toEqual([
      expect.objectContaining({ kind: 'baseQty', pct: 72 }),
      expect.objectContaining({ kind: 'treasureQty', pct: 112 }),
      expect.objectContaining({ kind: 'rarity', pct: 196 }),
      expect.objectContaining({ kind: 'multiply', item: 'scrap', pct: 84, times: 3 }),
      expect.objectContaining({ kind: 'multiply', item: 'thread', pct: 84, times: 3 }),
    ]);
  });

  it('Whisper of Armament', () => {
    const text = [
      '+ 28 % chance for Hero Memories to appear among base Void Sea Treasure drops',
      '+ 21 % additional Hero Memory Drop Quantity in base Void Sea Treasure drops',
      '2 additional Hero Memory(ies) drop from Void Sea Treasures',
      '20 % chance for 8 additional Hero Memory(ies) to drop from Void Sea Treasures',
    ].join(' ');
    const { affixes } = parseAffixes(text);
    expect(affixes).toEqual([
      expect.objectContaining({ kind: 'appear', item: 'hero', pct: 28 }),
      expect.objectContaining({ kind: 'itemQty', item: 'hero', pct: 21 }),
      expect.objectContaining({ kind: 'flat', item: 'hero', n: 2 }),
      expect.objectContaining({ kind: 'chanceFlat', item: 'hero', pct: 20, n: 8 }),
    ]);
  });

  it('handles affixes wrapped across OCR lines and OCR digit errors', () => {
    const text = 'Void Sea Treasures drop 3O additional\nMemory Scrap(s)';
    expect(parseAffixes(text).affixes).toEqual([
      expect.objectContaining({ kind: 'flat', item: 'scrap', n: 30 }),
    ]);
  });

  it('Boss Whisper invitations', () => {
    const { affixes } = parseAffixes(
      'Void Sea Treasures drop 2 additional Void Sea Invitation(s)\n' +
        '30% chance for 1 additional Void Sea Invitation(s) to drop from Void Sea Treasures',
    );
    expect(affixes).toEqual([
      expect.objectContaining({ kind: 'flat', item: 'invitation', n: 2 }),
      expect.objectContaining({ kind: 'chanceFlat', item: 'invitation', pct: 30, n: 1 }),
    ]);
  });

  it('reports unrecognized affix text with numbers as unknown', () => {
    const { affixes, unknown } = parseAffixes('+15% Movement Speed while sailing\nWhisper of Wealth');
    expect(affixes).toEqual([]);
    expect(unknown).toEqual(['+15% Movement Speed while sailing']);
  });
});

describe('erros reais de OCR na tela SS14', () => {
  const first = (t: string) => parseAffixes(t).affixes[0];

  it('"+184%" impossível para Scrap appear vira 14 (o "%" foi lido como 8)', () => {
    expect(first('+184% chance for Memory Scraps to appear among base Void Sea Treasure drops')).toMatchObject({ kind: 'appear', item: 'scrap', pct: 14 });
  });

  it('"+142 chance" (o "%" virou 2) vira 14', () => {
    expect(first('+142 chance for Memory Scraps to appear among base Void Sea Treasure drops')).toMatchObject({ kind: 'appear', pct: 14 });
  });

  it('"+ 14° chance" e "14 chance" sem % são aceitos', () => {
    expect(first('+ 14° chance for Memory Scraps to appear among base Void Sea Treasure drops')).toMatchObject({ pct: 14 });
    expect(first('NY \ 14 chance for Memory Scraps to appear among base Void Sea Treasure drops')).toMatchObject({ pct: 14 });
  });

  it('valores plausíveis fora da tabela são mantidos (talentos podem alterar)', () => {
    expect(first('Void Sea Treasures drop 30 additional Memory Scrap(s)')).toMatchObject({ kind: 'flat', n: 30 });
    expect(first('+53% chance for Memory Threads to appear among base Void Sea Treasure drops')).toMatchObject({ pct: 53 });
  });
});

describe('mais erros reais (gravação da sessão)', () => {
  const first = (t: string) => parseAffixes(t).affixes[0];
  it('"for B additional" / "for & additional" → 8', () => {
    expect(first('20% chance for B additional Hero Memory(ies) to drop from Void Sea Treasures')).toMatchObject({ kind: 'chanceFlat', item: 'hero', n: 8 });
    expect(first('20% chance for & additional Memory Scrap(s) to drop')).toMatchObject({ kind: 'chanceFlat', n: 8 });
  });
  it('"ror"/"tor" no lugar de "for"', () => {
    expect(first('20% chance ror 194 additional Memory Scrap(s) to drop from Void Sea Treasures')).toMatchObject({ kind: 'chanceFlat', n: 194 });
    expect(first('+ 53% chance tor Memory Threads to appear among base Void Sea Treasure drops')).toMatchObject({ kind: 'appear', pct: 53 });
  });
});
