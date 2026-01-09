import * as path from 'node:path';
import * as fs from 'fs';
import type { StartedDockerComposeEnvironment } from 'testcontainers';
import { DockerComposeEnvironment, Wait } from 'testcontainers';
import type { ResolverType } from '../../lib/configuration';

export class FlagdComposeContainer {
  private static imageBase = 'ghcr.io/open-feature/flagd-testbed';
  private static testHarnessDir = path.join(__dirname, './../../../../../shared/flagd-core/test-harness/');

  private environment?: StartedDockerComposeEnvironment;
  private version: string;
  private started = false;
  private host = 'localhost';
  private ports: Map<string, number> = new Map();

  public static build(): FlagdComposeContainer {
    return new FlagdComposeContainer();
  }

  private constructor() {
    this.version = this.readVersion();
  }

  private readVersion(): string {
    const versionFile = path.join(FlagdComposeContainer.testHarnessDir, 'version.txt');
    return fs.readFileSync(versionFile, 'utf8').trim();
  }

  isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.isStarted()) {
      return Promise.resolve();
    }

    const flagsDir = path.join(FlagdComposeContainer.testHarnessDir, 'flags');

    console.log('Starting docker-compose stack');
    console.log(`Using image: ${FlagdComposeContainer.imageBase}:v${this.version}`);

    // create and start the compose environment
    this.environment = await new DockerComposeEnvironment(FlagdComposeContainer.testHarnessDir, 'docker-compose.yaml')
      .withEnvironment({
        IMAGE: FlagdComposeContainer.imageBase,
        VERSION: `v${this.version}`,
        FLAGS_DIR: flagsDir,
      })
      .withWaitStrategy('flagd-1', Wait.forHealthCheck())
      .withStartupTimeout(60000)
      .up();

    await this.extractPortMappings();

    this.started = true;
    console.log('Docker-compose stack started successfully');
  }

  async stop(): Promise<void> {
    if (!this.started || !this.environment) {
      throw new Error('Container not started');
    }

    await this.environment.down();

    this.started = false;
    this.environment = undefined;
    this.ports.clear();
  }

  /**
   * Get the launchpad URL for the flagd service.
   */
  getLaunchpadUrl(): string {
    const port = this.ports.get('flagd:8080');
    if (!port) {
      throw new Error('Launchpad port not available');
    }
    return `${this.host}:${port}`;
  }

  /**
   * Get the port for a specific resolver type (RPC or in-process).
   */
  getPort(resolverType: ResolverType): number {
    switch (resolverType) {
      case 'in-process': {
        const inProcessPort = this.ports.get('flagd:8015');
        if (!inProcessPort) {
          throw new Error('In-process port not available');
        }
        return inProcessPort;
      }
      default: {
        const rpcPort = this.ports.get('flagd:8013');
        if (!rpcPort) {
          throw new Error('RPC port not available');
        }
        return rpcPort;
      }
    }
  }

  /**
   * Get the envoy forbidden endpoint port (returns 403 for testing).
   */
  getForbiddenPort(): number {
    const port = this.ports.get('envoy:9212');
    if (!port) {
      throw new Error('Forbidden port not available');
    }
    return port;
  }

  private async extractPortMappings(): Promise<void> {
    if (!this.environment) {
      throw new Error('Environment not initialized');
    }

    const flagdContainer = this.environment.getContainer('flagd-1');
    const envoyContainer = this.environment.getContainer('envoy-1');

    this.ports.set('flagd:8013', flagdContainer.getMappedPort(8013));
    this.ports.set('flagd:8014', flagdContainer.getMappedPort(8014));
    this.ports.set('flagd:8015', flagdContainer.getMappedPort(8015));
    this.ports.set('flagd:8080', flagdContainer.getMappedPort(8080));

    this.ports.set('envoy:9211', envoyContainer.getMappedPort(9211));
    this.ports.set('envoy:9212', envoyContainer.getMappedPort(9212));
    this.ports.set('envoy:9901', envoyContainer.getMappedPort(9901));
  }
}
