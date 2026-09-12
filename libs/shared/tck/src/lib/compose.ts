import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import type { Provider } from '@openfeature/server-sdk';
import type * as Testcontainers from 'testcontainers';
import { HttpControl } from './httpControl';
import type { TckOptions } from './options';
import { eventTimeout, readyTimeout } from './options';
import { runProviderTck } from './runProviderTck';

/** The Compose service the suite looks for unless told otherwise. */
export const DEFAULT_BACKEND_SERVICE = 'backend';

/** The container-internal port the control API is assumed to listen on. */
export const DEFAULT_CONTROL_PORT = 8080;

/** How long the stack and its control API have to become reachable. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 60_000;

/**
 * Addresses of the running stack, handed to {@link ContainerizedTckOptions.newProvider}.
 *
 * This type exists because host ports are only known *after* the stack has started. A Compose file
 * under test must not pin them — Docker assigns them dynamically, so a provider cannot be
 * configured until the stack is up, which is why the provider is supplied as a factory rather than
 * as an instance.
 *
 * The mapping is stable for the life of the suite: the stack is started once and never restarted,
 * so a provider built from this endpoint stays valid across every scenario. See the
 * no-container-restart invariant in the control API document.
 */
export interface BackendEndpoint {
  /**
   * The host the backend service is reachable on.
   *
   * Not necessarily `localhost`: with a remote Docker daemon, Docker Desktop on some platforms, or
   * a rootless setup it can be an arbitrary address. Always use this rather than hard-coding a
   * host.
   */
  readonly host: string;

  /** The host a named service is reachable on. One Compose stack, so usually {@link host}. */
  hostFor(service: string): string;

  /**
   * The dynamically mapped host port for a container-internal port on the backend service.
   *
   * The port must be one of {@link ContainerizedTckOptions.backendPorts}, or the control port,
   * which is mapped automatically.
   */
  port(internalPort: number): number;

  /**
   * The dynamically mapped host port for a container-internal port on a named service.
   *
   * For a stack with more than one service — a proxy, an edge service, a sidecar. The service and
   * port must be declared in {@link ContainerizedTckOptions.additionalPorts}.
   */
  port(service: string, internalPort: number): number;
}

/** Creates a provider under test against the running stack. */
export type ContainerizedProviderFactory = (endpoint: BackendEndpoint) => Provider | Promise<Provider>;

/**
 * The whole contract for a provider that talks to an **external backend**: name a Compose file, say
 * which ports the provider connects to, and build a provider from a discovered endpoint.
 *
 * Everything {@link TckOptions} leaves to the adopter for a containerised backend is supplied here:
 * the Compose lifecycle, discovery of the dynamically mapped host ports, and an {@link HttpControl}
 * built against the stack's control API. `control` is therefore absent — the suite owns it — and
 * `newProvider` receives a {@link BackendEndpoint} instead of nothing.
 *
 * The HTTP control API in `openapi/control-api.yaml` is the normative contract here, and that is
 * the point: another language's suite drives the same endpoints against the same stack and must get
 * the same answers. Substituting an in-process control that manipulates an external backend through
 * a side channel bypasses it — see {@link BackendControl} for why that is not an acceptable adoption
 * path.
 */
export interface ContainerizedTckOptions extends Omit<TckOptions, 'control' | 'newProvider'> {
  /**
   * Path to the Docker Compose file describing the backend stack.
   *
   * **Pass an absolute path** — `join(__dirname, 'docker-compose.yaml')` — for the same reason
   * {@link TckOptions.extensionFeatures} asks for one: a relative path resolves against the test
   * runner's working directory, which is the workspace root rather than your test file's directory.
   * A relative path is accepted and resolved that way, and the failure message says so.
   *
   * The stack must not pin host ports. Docker assigns them dynamically and the suite discovers them
   * after startup; a pinned port would make the suite unrunnable in parallel and would collide with
   * a developer's own backend on the same machine.
   */
  composeFile: string;

  /**
   * Container-internal ports on {@link backendService} that the **provider** connects to.
   *
   * The control port is mapped automatically and must not be listed here — listing it is refused,
   * because a provider that connects to the control API is not the arrangement this suite tests.
   */
  backendPorts: readonly number[];

  /** Creates the provider under test, configured against the running stack. Once per scenario. */
  newProvider: ContainerizedProviderFactory;

  /**
   * The Compose service hosting both the control API and the backend.
   *
   * @default 'backend'
   */
  backendService?: string;

  /**
   * The container-internal port the control API listens on.
   *
   * @default 8080
   */
  controlPort?: number;

  /**
   * Extra services and container-internal ports, for a stack with more than one service.
   *
   * Keys are Compose service names, values are container-internal ports. Resolve them through
   * {@link BackendEndpoint.port} by service name. Declaring them is what makes an undeclared
   * lookup a message about this option rather than a Testcontainers error about a container.
   *
   * @default {} — no extra services
   */
  additionalPorts?: Readonly<Record<string, readonly number[]>>;

  /**
   * The named flag configuration passed to `POST /start`, which seeds the canonical flag set.
   *
   * The same option as {@link HttpControlOptions.configuration}, and it defaults the same way.
   *
   * @default 'default'
   */
  configuration?: string;

  /**
   * How long the stack and its control API have to become reachable.
   *
   * Counts from the moment `docker compose up` is invoked, so on a machine that has not pulled the
   * images yet it includes the pull. 60 seconds is right for a warm machine; a cold CI runner
   * pulling a backend image wants considerably more.
   *
   * @default 60000
   */
  startupTimeoutMs?: number;
}

/**
 * Loads Testcontainers on first use rather than on import.
 *
 * `testcontainers` is an optional peer dependency, so a provider with no backend — in-memory,
 * in-process, environment-variable — adopts this library without pulling Docker tooling into its
 * node_modules. A static import at the top of this module would defeat that, because this module is
 * re-exported from the package entry point and so is loaded by every adopter.
 */
async function loadTestcontainers(): Promise<typeof Testcontainers> {
  try {
    return await import('testcontainers');
  } catch (error) {
    throw new Error(
      `tck: runContainerizedProviderTck needs the 'testcontainers' package, which could not be ` +
        `loaded: ${(error as Error).message}. It is an optional peer dependency of this library, ` +
        `so install it in the adopting project -- 'npm i -D testcontainers'. A provider with no ` +
        `backend needs neither it nor this entry point: supply your own BackendControl to ` +
        `runProviderTck instead.`,
    );
  }
}

/**
 * The ports the suite will resolve, per Compose service.
 *
 * The control port is added to the backend service's set even though it is never listed in
 * `backendPorts`: it is mapped automatically, and refusing to resolve it would make the harness
 * unable to build its own control URL.
 *
 * Exported for the unit tests, which is worth doing because this and {@link requireDeclared} are
 * the whole of the rule that makes `backendPorts` and `additionalPorts` load-bearing in JavaScript.
 * Compose publishes whatever the Compose file lists whether the options mention it or not, so
 * without the rule those two options would be documentation rather than configuration. Not part of
 * the package surface.
 */
export function declaredPorts(options: {
  backendService: string;
  controlPort: number;
  backendPorts: readonly number[];
  additionalPorts: Readonly<Record<string, readonly number[]>>;
}): Map<string, Set<number>> {
  const declared = new Map<string, Set<number>>([
    [options.backendService, new Set([...options.backendPorts, options.controlPort])],
  ]);
  for (const [service, ports] of Object.entries(options.additionalPorts)) {
    // A service named twice -- the backend service repeated under additionalPorts -- gets one set,
    // because two sets for one service would make which ports resolve depend on lookup order.
    const existing = declared.get(service);
    if (existing) {
      ports.forEach((port) => existing.add(port));
    } else {
      declared.set(service, new Set(ports));
    }
  }
  return declared;
}

/** Refuses a port the options never declared, naming the option that should have declared it. */
export function requireDeclared(declared: Map<string, Set<number>>, service: string, internalPort: number): void {
  if (declared.get(service)?.has(internalPort)) {
    return;
  }

  const summary = [...declared.entries()]
    .map(([name, ports]) => `'${name}' ${[...ports].sort((a, b) => a - b).join(' ')}`)
    .join('; ');

  throw new Error(
    `tck: port ${internalPort} on service '${service}' was not declared, so the suite does not ` +
      `resolve it. Declare a port on the backend service in backendPorts, and a port on any other ` +
      `service in additionalPorts. Declared today: ${summary}.`,
  );
}

/**
 * The Compose stack, started once per suite and never restarted.
 *
 * Never restarted because Testcontainers cannot reliably preserve dynamically mapped host ports
 * across a restart: a restarted service generally comes back on a different host port, silently
 * invalidating every provider already pointed at the old one, and the resulting failure looks like
 * a flaky provider. Backend unavailability is therefore always simulated *inside* the running stack
 * through the control API's `POST /stop`.
 */
class ComposeStack {
  private environment: Testcontainers.StartedDockerComposeEnvironment | undefined;

  /** Container-internal ports the suite is willing to resolve, per Compose service. */
  private readonly declared: Map<string, Set<number>>;

  constructor(
    private readonly composeFile: string,
    private readonly backendService: string,
    private readonly controlPort: number,
    backendPorts: readonly number[],
    additionalPorts: Readonly<Record<string, readonly number[]>>,
    private readonly startupTimeoutMs: number,
  ) {
    this.declared = declaredPorts({ backendService, controlPort, backendPorts, additionalPorts });
  }

  async start(): Promise<void> {
    if (this.environment) {
      return;
    }

    const { DockerComposeEnvironment } = await loadTestcontainers();

    // eslint-disable-next-line no-console
    console.log(`tck: starting the Compose stack ${this.composeFile} (once per suite, never restarted)`);

    // No wait strategy of its own: DockerComposeEnvironment already defaults to waiting for every
    // published port of every service to listen, which is what the control API document says the
    // suite establishes before the first scenario. `withStartupTimeout` bounds that wait.
    this.environment = await new DockerComposeEnvironment(dirname(this.composeFile), basename(this.composeFile))
      .withStartupTimeout(this.startupTimeoutMs)
      .up();
  }

  async stop(): Promise<void> {
    const environment = this.environment;
    this.environment = undefined;
    // `down` rather than `stop`, so the project's network and anonymous volumes go too. Nothing in
    // the stack outlives the suite.
    await environment?.down();
  }

  /** The control API's root, for the {@link HttpControl} thunk. Resolved on the first control call. */
  controlApiUrl(): string {
    return `http://${this.hostFor(this.backendService)}:${this.mappedPort(this.backendService, this.controlPort)}`;
  }

  /**
   * The endpoint handed to the provider factory.
   *
   * A fresh object, but every accessor on it reads through to the live stack rather than capturing
   * a value: the endpoint is built once per scenario while the ports it reports belong to the stack,
   * and a snapshot would be a second place for them to be wrong. `host` is a getter for the same
   * reason -- it reads better than a method at the call site, and must still not be resolved before
   * the stack is up.
   */
  endpoint(): BackendEndpoint {
    const backendService = this.backendService;
    const hostFor = (service: string) => this.hostFor(service);
    const mappedPort = (service: string, internalPort: number) => this.mappedPort(service, internalPort);

    return {
      get host(): string {
        return hostFor(backendService);
      },
      hostFor,
      port: (first: number | string, second?: number) =>
        typeof first === 'number' ? mappedPort(backendService, first) : mappedPort(first, second as number),
    };
  }

  private started(): Testcontainers.StartedDockerComposeEnvironment {
    if (!this.environment) {
      throw new Error(
        'tck: the Compose stack has not been started. The endpoint is only resolvable from inside ' +
          'a scenario -- reading it at module load, before the suite has brought the stack up, is ' +
          'the usual cause.',
      );
    }
    return this.environment;
  }

  /**
   * The started container for a Compose service.
   *
   * Compose names a service's first replica `<service>-1`, and that is the key Testcontainers
   * registers it under. Hidden here so that neither the harness nor an adopter has to know it: the
   * options and the endpoint both speak in service names.
   */
  private container(service: string) {
    try {
      return this.started().getContainer(`${service}-1`);
    } catch (error) {
      throw new Error(
        `tck: the Compose stack has no running service '${service}' (${(error as Error).message}). ` +
          `backendService is '${this.backendService}' and additionalPorts names ` +
          `${this.serviceList()}; every one of them has to be a service in ${this.composeFile}.`,
      );
    }
  }

  private hostFor(service: string): string {
    return this.container(service).getHost();
  }

  private mappedPort(service: string, internalPort: number): number {
    requireDeclared(this.declared, service, internalPort);
    return this.container(service).getMappedPort(internalPort);
  }

  private serviceList(): string {
    const extra = [...this.declared.keys()].filter((service) => service !== this.backendService);
    return extra.length ? extra.map((service) => `'${service}'`).join(', ') : 'no other service';
  }
}

/**
 * Rejects a configuration the stack could not honour, before Jest schedules anything.
 *
 * Exported for the unit tests, which cannot call {@link runContainerizedProviderTck} on options
 * that pass: the entry point registers hooks and a `describe`, and doing that from inside a test is
 * not something Jest allows. Not part of the package surface.
 */
export function checkOptions(options: ContainerizedTckOptions): void {
  const { composeFile, backendPorts } = options;

  if (!composeFile) {
    throw new Error(
      'tck: composeFile is required. It is the Docker Compose file describing the backend stack; ' +
        "pass an absolute path, join(__dirname, 'docker-compose.yaml').",
    );
  }

  if (!existsSync(composeFile)) {
    throw new Error(
      `tck: composeFile ${composeFile} does not exist.` +
        (isAbsolute(composeFile)
          ? ''
          : ' It is relative, so it resolved against the test runner working directory -- the' +
            " workspace root, not your test file's directory. Pass an absolute path:" +
            " join(__dirname, 'docker-compose.yaml')."),
    );
  }

  if (!backendPorts.length) {
    throw new Error(
      'tck: backendPorts is empty. It is the container-internal ports the provider under test ' +
        'connects to, and a provider that connects to nothing wants runProviderTck with a ' +
        'BackendControl of its own rather than a Compose stack.',
    );
  }

  const controlPort = options.controlPort ?? DEFAULT_CONTROL_PORT;
  if (backendPorts.includes(controlPort)) {
    throw new Error(
      `tck: backendPorts names the control port ${controlPort}, which is mapped automatically and ` +
        `must not be listed. backendPorts is the ports the *provider* connects to; the suite ` +
        `drives the control API itself, and a provider pointed at it would be testing the ` +
        `testbed rather than the backend. Set controlPort if the control API is somewhere else.`,
    );
  }
}

/**
 * Runs the Provider Conformance Suite against a provider whose backend comes up from a Docker
 * Compose file.
 *
 * This is the path for the overwhelming majority of providers. The adopter supplies a Compose file
 * and a factory; the suite starts the stack once, discovers the dynamically mapped host ports,
 * builds the HTTP control against the control API, waits until it accepts commands, constructs a
 * provider per scenario and tears the stack down after the last one.
 *
 * ```ts
 * runContainerizedProviderTck({
 *   name: 'my-provider',
 *   composeFile: join(__dirname, 'docker-compose.yaml'),
 *   backendPorts: [8013],
 *   newProvider: (endpoint) => new MyProvider({ host: endpoint.host, port: endpoint.port(8013) }),
 *   newUnavailableProvider: () => new MyProvider({ host: 'localhost', port: 9999 }),
 * });
 * ```
 *
 * `runProviderTck` remains the path for a provider with **no** backend — in-memory, in-process,
 * environment-variable — which supplies its own {@link BackendControl}. Compose is an additional
 * path, and now the default one, for a provider that talks to something.
 *
 * One suite per file, for the same reason as {@link runProviderTck}: jest-cucumber accumulates step
 * definitions in module state. Two resolvers means two files sharing a Compose file.
 */
export function runContainerizedProviderTck(options: ContainerizedTckOptions): void {
  checkOptions(options);

  const {
    composeFile,
    backendPorts,
    newProvider,
    backendService = DEFAULT_BACKEND_SERVICE,
    controlPort = DEFAULT_CONTROL_PORT,
    additionalPorts = {},
    configuration,
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    ...tck
  } = options;

  const stack = new ComposeStack(
    composeFile,
    backendService,
    controlPort,
    backendPorts,
    additionalPorts,
    startupTimeoutMs,
  );

  // The thunk form, because the control API's host port does not exist until the stack is up while
  // this call happens at module load. Resolved once, on the first control call, which is safe
  // precisely because nothing restarts the stack.
  const control = new HttpControl({ baseUrl: () => stack.controlApiUrl(), configuration });

  // A scenario may await readiness once and then several events, and Jest's own default of five
  // seconds is never enough for a real backend. Derived from the suite's own timeouts rather than
  // guessed, and set before the describe block so an adopter can override it after this call.
  jest.setTimeout(readyTimeout(options) + 4 * eventTimeout(options));

  // At the file's root scope, so it runs before the beforeEach that runProviderTck installs inside
  // its own describe block. The five seconds on top of the startup budget are so that the stack's
  // own timeout message wins the race with Jest's, which says only that a hook timed out.
  beforeAll(async () => {
    await stack.start();
    await control.awaitReady(startupTimeoutMs);
  }, startupTimeoutMs + 5_000);

  afterAll(async () => {
    await stack.stop();
  }, startupTimeoutMs + 5_000);

  runProviderTck({
    ...tck,
    control,
    // Read inside the factory: the mapped ports do not exist until the stack is up. They stay valid
    // for the whole suite because nothing restarts a container.
    newProvider: () => newProvider(stack.endpoint()),
  });
}
