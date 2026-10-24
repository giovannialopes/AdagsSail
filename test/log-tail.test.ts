import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LogTail } from '../src/main/log-tail';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('LogTail', () => {
  let tail: LogTail | null = null;
  afterEach(() => tail?.stop());

  it('starts at the end, emits appended lines and survives truncation', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'adags-')), 'UE_game.log');
    writeFileSync(file, 'old line 1\nold line 2\n');
    const got: string[] = [];
    tail = new LogTail(file, 20);
    tail.on('line', (l: string) => got.push(l));
    tail.start();
    await wait(60);
    appendFileSync(file, 'new A\nnew B\npartial');
    await wait(80);
    expect(got).toEqual(['new A', 'new B']);
    appendFileSync(file, ' end\r\n');
    await wait(80);
    expect(got).toEqual(['new A', 'new B', 'partial end']);
    writeFileSync(file, 'after restart\n');
    await wait(80);
    expect(got.at(-1)).toBe('after restart');
  });

  it('readTail returns the last bytes of the file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'adags-')), 'x.log');
    writeFileSync(file, 'abcdefghij');
    tail = new LogTail(file);
    expect(tail.readTail(4)).toBe('ghij');
  });
});
