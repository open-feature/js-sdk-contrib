/**
 * TestLogger is a logger build for testing purposes.
 * This is not ready to be production ready, so please avoid using it.
 */
export class TestLogger {
  private _ordering: { type: string; pos: number }[] = [];
  public inMemoryLogger: Record<string, string[]> = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };

  error(...args: unknown[]): void {
    this._ordering.push({ type: 'error', pos: this.inMemoryLogger['error'].length });
    this.inMemoryLogger['error'].push(args.join(' '));
  }

  warn(...args: unknown[]): void {
    this._ordering.push({ type: 'warn', pos: this.inMemoryLogger['warn'].length });
    this.inMemoryLogger['warn'].push(args.join(' '));
  }

  info(...args: unknown[]): void {
    this._ordering.push({ type: 'info', pos: this.inMemoryLogger['info'].length });
    this.inMemoryLogger['info'].push(args.join(' '));
  }

  debug(...args: unknown[]): void {
    this._ordering.push({ type: 'debug', pos: this.inMemoryLogger['debug'].length });
    this.inMemoryLogger['debug'].push(args.join(' '));
  }

  public timeline() {
    return this._ordering.map((e) => `[${e.type.toUpperCase()}] ${this.inMemoryLogger[e.type][e.pos]}`);
  }

  reset() {
    this._ordering = [];
    this.inMemoryLogger = {
      error: [],
      warn: [],
      info: [],
      debug: [],
    };
  }
}
