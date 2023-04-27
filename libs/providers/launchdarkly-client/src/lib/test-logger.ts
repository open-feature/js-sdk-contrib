import { LDLogger } from 'launchdarkly-js-client-sdk';

export default class TestLogger implements LDLogger {
  public logs: string[] = [];

  error(...args: any[]): void {
    this.logs.push(args.join(' '));
  }

  warn(...args: any[]): void {
    this.logs.push(args.join(' '));
  }

  info(...args: any[]): void {
    this.logs.push(args.join(' '));
  }

  debug(...args: any[]): void {
    this.logs.push(args.join(' '));
  }

  reset() {
    this.logs = [];
  }
}
