import { EventEmitter } from 'node:events';
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';

const MAX_READ = 512 * 1024;

// Lê o UE_game.log incrementalmente (o jogo só faz append; se o arquivo encolher, recomeça do início).
export class LogTail extends EventEmitter {
  private pos = -1;
  private rest = '';
  private timer: NodeJS.Timeout | null = null;
  lastChangeAt = 0;

  constructor(
    readonly file: string,
    private readonly pollMs = 250,
  ) {
    super();
  }

  // `from`: posição de onde começar (padrão: fim do arquivo).
  start(from?: number): void {
    try {
      this.pos = from ?? statSync(this.file).size;
    } catch {
      this.pos = 0;
    }
    this.timer = setInterval(() => this.poll(), this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private poll(): void {
    let fd: number;
    try {
      fd = openSync(this.file, 'r');
    } catch {
      return;
    }
    try {
      const size = fstatSync(fd).size;
      if (size < this.pos) {
        this.pos = 0;
        this.rest = '';
      }
      if (size === this.pos) return;
      const len = Math.min(size - this.pos, MAX_READ);
      const buf = Buffer.alloc(len);
      const read = readSync(fd, buf, 0, len, this.pos);
      this.pos += read;
      this.lastChangeAt = Date.now();
      const text = this.rest + buf.toString('utf8', 0, read);
      const lines = text.split('\n');
      this.rest = lines.pop() ?? '';
      for (const line of lines) this.emit('line', line.replace(/\r$/, ''));
    } catch (err) {
      this.emit('error', err);
    } finally {
      closeSync(fd);
    }
  }

  readTail(bytes: number): string {
    const fd = openSync(this.file, 'r');
    try {
      const size = fstatSync(fd).size;
      const start = Math.max(0, size - bytes);
      const buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  }
}
