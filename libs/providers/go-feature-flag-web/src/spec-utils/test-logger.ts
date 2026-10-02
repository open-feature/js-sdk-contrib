/**
 * internal - the type of stored logs from the TestLogger
 */
type TestLoggerTimelineItem = {
  type: string;
  pos: number;
  ts: string;
};

/**
 * TestLogger is a logger build for testing purposes.
 * This is not ready to be production ready, so please avoid using it.
 */
export class TestLogger {
  private _ordering: TestLoggerTimelineItem[] = [];
  private _timelineMappingFn: Record<string, (e: TestLoggerTimelineItem) => string> = {
    'true|true': (e) => `[${e.ts}][${e.type.toUpperCase()}] ${this.inMemoryLogger[e.type][e.pos]}`,
    'true|false': (e) => `[${e.type.toUpperCase()}] ${this.inMemoryLogger[e.type][e.pos]}`,
    'false|true': (e) => `[${e.ts}] ${this.inMemoryLogger[e.type][e.pos]}`,
    'false|false': (e) => `${this.inMemoryLogger[e.type][e.pos]}`,
  };

  public inMemoryLogger: Record<string, string[]> = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };

  error(...args: unknown[]): void {
    this._ordering.push({ type: 'error', pos: this.inMemoryLogger['error'].length, ts: new Date().toISOString() });
    this.inMemoryLogger['error'].push(args.join(' '));
  }

  warn(...args: unknown[]): void {
    this._ordering.push({ type: 'warn', pos: this.inMemoryLogger['warn'].length, ts: new Date().toISOString() });
    this.inMemoryLogger['warn'].push(args.join(' '));
  }

  info(...args: unknown[]): void {
    this._ordering.push({ type: 'info', pos: this.inMemoryLogger['info'].length, ts: new Date().toISOString() });
    this.inMemoryLogger['info'].push(args.join(' '));
  }

  debug(...args: unknown[]): void {
    this._ordering.push({ type: 'debug', pos: this.inMemoryLogger['debug'].length, ts: new Date().toISOString() });
    this.inMemoryLogger['debug'].push(args.join(' '));
  }

  public timeline(withLogLevel = true, withTimestamp = false) {
    const mappingFunction = this._timelineMappingFn[`${withLogLevel || false}|${withTimestamp || false}`];
    return this._ordering.map(mappingFunction);
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
