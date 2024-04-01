/**
 * TestLogger is a logger build for testing purposes.
 * This is not ready to be production ready, so please avoid using it.
 */
export default class TestLogger {
  error(...args: unknown[]): void {
    console.log(args.join(' '));
  }

  warn(...args: unknown[]): void {
    console.log(args.join(' '));
  }

  info(...args: unknown[]): void {
    console.log(args.join(' '));
  }

  debug(...args: unknown[]): void {
    console.log(args.join(' '));
  }
}
