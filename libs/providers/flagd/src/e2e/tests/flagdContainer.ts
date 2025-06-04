import type { StartedTestContainer, StoppedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import fs from 'fs';
import * as path from 'node:path';
import type { ResolverType } from '../../lib/configuration';

export class FlagdContainer extends GenericContainer {
  private static imageBase = 'ghcr.io/open-feature/flagd-testbed';
  private started: StartedTestContainer | undefined;
  private stopped: StoppedTestContainer | undefined;

  public static build() {
    return new FlagdContainer(this.generateImageName());
  }

  private constructor(image: string) {
    super(image);
    this.withExposedPorts(8080, 8013, 8014, 8015, 8016);
  }

  isStarted(): boolean {
    return this.started !== undefined;
  }

  async start(): Promise<StartedTestContainer> {
    if (this.isStarted()) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return Promise.resolve(this.started);
    }
    const containerPromise = super.start();
    this.started = await containerPromise;
    this.stopped = undefined;
    return containerPromise;
  }

  async stop(): Promise<StoppedTestContainer> {
    if (!this.started) {
      throw new Error('container not started');
    }
    const containerPromise = this.started.stop();
    this.stopped = await containerPromise;
    this.started = undefined;
    return containerPromise;
  }

  getLaunchpadUrl() {
    return this.started?.getHost() + ':' + this.started?.getMappedPort(8080);
  }

  private static generateImageName(): string {
    const image = this.imageBase;
    const file = path.join(__dirname, './../../../../../shared/flagd-core/test-harness/', 'version.txt');
    const version = fs.readFileSync(file, 'utf8').trim();
    return `${image}:v${version}`;
  }

  getPort(resolverType: ResolverType) {
    switch (resolverType) {
      default:
        return this.started?.getMappedPort(8013);
      case 'in-process':
        return this.started?.getMappedPort(8015);
    }
  }
}
