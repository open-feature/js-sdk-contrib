/**
 * TestLogger is a logger build for testing purposes.
 * This is not ready to be production ready, so please avoid using it.
 */
export default class TestLogger {
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
