export default class TestLoggerSpec {
  public inMemoryLogger: Record<string, string[]> = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };

  error(...args: unknown[]): void {
    this.inMemoryLogger['error'].push(args.join(' '));
  }

  warn(...args: unknown[]): void {
    this.inMemoryLogger['warn'].push(args.join(' '));
  }

  info(...args: unknown[]): void {
    this.inMemoryLogger['info'].push(args.join(' '));
  }

  debug(...args: unknown[]): void {
    this.inMemoryLogger['debug'].push(args.join(' '));
  }

  reset() {
    this.inMemoryLogger = {
      error: [],
      warn: [],
      info: [],
      debug: [],
    };
  }
}
