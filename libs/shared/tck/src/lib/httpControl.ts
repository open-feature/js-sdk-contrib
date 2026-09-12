import type { BackendControl, ConnectionControl } from './control';

/**
 * The backend configuration name every backend under test must support, and the one that serves the
 * canonical flag set.
 *
 * Named for the *backend's* configuration throughout, never bare `configuration`: in a conformance
 * report `provider.configuration` means which mode of the provider was tested — flagd RPC against
 * flagd in-process — which is what {@link TckOptions.name} feeds. Two unrelated things sharing the
 * word is how one language ended up meaning the opposite of another.
 */
export const DEFAULT_BACKEND_CONFIGURATION = 'default';

/**
 * How long a single control-API request may take.
 *
 * Control calls are local HTTP to a container on the same host; anything slower than this is a
 * wedged backend rather than a slow one.
 */
export const DEFAULT_CONTROL_TIMEOUT_MS = 30_000;

/** Configures an {@link HttpControl}. */
export interface HttpControlOptions {
  /**
   * The root of the control API, scheme included — for example `http://localhost:32768`.
   *
   * It must be built from the **dynamically mapped host port** of the control service, which does
   * not exist until the stack is up. `runProviderTck` has to be called at module load, before any
   * `beforeAll` has run, so a plain string is usually impossible to supply. Hence the thunk form:
   *
   * ```ts
   * const control = new HttpControl({ baseUrl: () => `http://${container.getControlUrl()}` });
   * ```
   *
   * It is resolved once, on the first control call, and reused for the rest of the suite — which is
   * safe precisely because no container is ever restarted mid-suite.
   */
  baseUrl: string | (() => string);

  /**
   * The named flag configuration of the **backend** to seed, passed to `POST /start`.
   *
   * Defaults to {@link DEFAULT_BACKEND_CONFIGURATION}, the only name every backend must support and
   * the one serving the canonical flag set.
   */
  backendConfiguration?: string;

  /** How long a single control-API request may take. @default 30000 */
  requestTimeoutMs?: number;
}

/**
 * A {@link BackendControl} that drives a backend under test over the HTTP control API defined in
 * `openapi/control-api.yaml`.
 *
 * This is the normative control path for any provider with a real backend, and it is what makes a
 * conformance claim portable: another language's TCK drives the same endpoints against the same
 * stack and must get the same answers. It uses the global `fetch`, so it adds no dependency.
 *
 * ## What it never does
 *
 * It never stops, kills or recreates a container. Unavailability is simulated inside the running
 * stack, through `POST /stop`, because container orchestrators assign host ports dynamically and
 * cannot reliably preserve them across a restart — a restarted backend generally comes back on a
 * different host port, silently invalidating every provider already pointed at the old one, and the
 * resulting failure looks like a flaky provider. Starting and stopping the stack itself belongs to
 * the adopting suite, once per suite.
 *
 * ## Scenario isolation
 *
 * {@link prepareScenario} prefers `POST /reset`, which restores the flag baseline with no
 * availability blip and therefore cannot inject a spurious lifecycle event into the next scenario.
 * That operation is optional, and a backend that does not implement it answers `404` or `501`; the
 * TCK then falls back to `POST /start?config=...`, which also resets flag state at the cost of a
 * process restart. The fallback is probed once and remembered for the rest of the suite.
 *
 * The fallback is the normal path today rather than an edge case: flagd-testbed's launchpad — the
 * reference implementation the control API was derived from — serves only `/start`, `/restart`,
 * `/stop` and `/change`.
 *
 * After a disconnect the backend may be down, and `/reset` is specified to reset flag state rather
 * than to start a stopped backend. `HttpControl` tracks that and uses `/start` for the scenario
 * following any disconnect.
 */
export class HttpControl implements BackendControl, ConnectionControl {
  /**
   * The normative way to drive a backend, which is what this class is.
   *
   * Stated rather than left to a reader's inference: `in-process` is a narrow allowance for
   * providers with nothing to connect to, and a claim of `http` is only worth anything if the
   * control that makes it is the one that actually spoke HTTP.
   */
  readonly controlApi = 'http' as const;

  private readonly resolveBaseUrl: () => string;
  private readonly backendConfiguration: string;
  private readonly requestTimeoutMs: number;

  /** The resolved, trailing-slash-free base URL; `undefined` until the first control call. */
  private baseUrl: string | undefined;

  /** `undefined` until the first `/reset` call tells us whether the backend implements it. */
  private resetSupported: boolean | undefined;

  /**
   * Records that a disconnect happened, so the next {@link prepareScenario} starts the backend
   * rather than merely resetting flag state.
   */
  private backendMaybeDown = false;

  constructor(options: HttpControlOptions) {
    const { baseUrl, backendConfiguration, requestTimeoutMs } = options;

    if (!baseUrl) {
      throw new Error(
        'HttpControlOptions.baseUrl is required: it is the root of the control API, built from ' +
          'the dynamically mapped host port of the control service',
      );
    }

    this.resolveBaseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.backendConfiguration = backendConfiguration ?? DEFAULT_BACKEND_CONFIGURATION;
    this.requestTimeoutMs = requestTimeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;
  }

  get description(): string {
    // Read while reporting, including in failure messages, which may be before the stack is up.
    // Reporting an address we do not have yet is not worth failing a test over.
    let target: string;
    try {
      target = this.base();
    } catch {
      target = 'the backend (control API address not resolved yet)';
    }
    return `${target}, driven over the control API`;
  }

  /**
   * Brings the backend back to the baseline, preferring `/reset` and falling back to `/start`.
   *
   * See the class documentation for why the choice is made this way, and why a scenario following a
   * disconnect always uses `/start`.
   */
  async prepareScenario(): Promise<void> {
    // A backend that may be stopped has to be started; /reset is specified to restore flag state,
    // not to bring a stopped backend back up.
    if (this.backendMaybeDown || this.resetSupported === false) {
      await this.start();
      this.backendMaybeDown = false;
      return;
    }

    const status = await this.call('/reset');

    if (status === 404 || status === 501) {
      // The documented fallback. Remembered so the probe happens once per suite.
      this.resetSupported = false;
      await this.start();
      return;
    }

    if (status < 200 || status >= 300) {
      throw new Error(`POST /reset on ${this.base()} returned ${status}`);
    }

    this.resetSupported = true;
  }

  async changeFlag(): Promise<void> {
    await this.require('/change');
  }

  /**
   * Waits until the control API will accept commands, or gives up after `timeoutMs`.
   *
   * A real readiness check against the control API itself, and the only waiting the suite does
   * around a control call. `GET /healthz` is **optional** in the control API document, which is why
   * a `404` counts as ready: the path is not implemented, and readiness then falls back to the
   * control port accepting a connection — which it just did, or this request would not have got an
   * answer. `503` is the specified "not ready yet", and a connection error is the stack still coming
   * up; both are retried.
   *
   * Note that this reports the health of the *control API*, never of the backend. The backend is
   * deliberately unreachable during the outage scenarios while the control API has to stay up,
   * otherwise the suite could not end the outage.
   *
   * There is deliberately no settle delay after a control call to pair with this. Every
   * state-changing endpoint — `/start`, `/change`, `/reset` — is specified not to return until the
   * new state is actually being served, so a fixed sleep afterwards would cover a window the API
   * says is not there. It is the control API's promise to keep, and a suite that slept instead of
   * holding the backend to it would stop being able to detect when it breaks. How long the
   * *provider* then takes to notice is a property of its transport, which is what the event timeout
   * is for; conflating the two makes the provider's detection latency unmeasurable, because the
   * clock starts before there is anything to detect.
   */
  async awaitReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = 'no attempt completed';

    for (;;) {
      try {
        const status = await this.probe();
        if (status === 200 || status === 404) {
          return;
        }
        last = `HTTP ${status}`;
      } catch (error) {
        last = (error as Error).message;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `the control API at ${this.base()} did not become ready within ${timeoutMs}ms; last ` +
            `attempt: ${last}. The stack is up as far as its published ports are concerned, so ` +
            `either the control API is not listening on the port the suite was told about, or it ` +
            `needs longer than this -- raise startupTimeoutMs.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /** One `GET /healthz`, returning its status code. Separate from {@link call}, which only POSTs. */
  private async probe(): Promise<number> {
    const target = `${this.base()}/healthz`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(target, { method: 'GET', signal: controller.signal });
      await response.arrayBuffer().catch(() => undefined);
      return response.status;
    } catch (error) {
      throw new Error(`GET ${target} failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Makes the backend unreachable without touching any container: the backend process inside the
   * still-running container is stopped.
   *
   * See the class documentation for why that distinction is a requirement rather than a preference.
   */
  async disconnect(): Promise<void> {
    this.backendMaybeDown = true;
    await this.require('/stop');
  }

  /**
   * Starts the backend again with the configuration already in effect.
   *
   * That restores the same baseline flag state, so the provider observes a change in availability
   * and never a change in flag values.
   */
  async reconnect(): Promise<void> {
    await this.start();
    this.backendMaybeDown = false;
  }

  private async start(): Promise<void> {
    await this.require('/start', { config: this.backendConfiguration });
  }

  /** Performs a control call and fails on any non-2xx response. */
  private async require(path: string, query?: Record<string, string>): Promise<void> {
    const status = await this.call(path, query);
    if (status < 200 || status >= 300) {
      throw new Error(`POST ${path} on ${this.base()} returned ${status}`);
    }
  }

  /** Performs one control-API request and returns its status code. */
  private async call(path: string, query?: Record<string, string>): Promise<number> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    const target = `${this.base()}${path}${search}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(target, { method: 'POST', signal: controller.signal });

      // The response body is drained and discarded: the control API's bodies are human-readable
      // messages the TCK is specified never to interpret, and draining releases the connection. It
      // cannot throw, so it never reaches the catch below.
      await response.arrayBuffer().catch(() => undefined);

      return response.status;
    } catch (error) {
      throw new Error(
        `control request POST ${target} failed: ${(error as Error).message}. The control API must ` +
          `stay reachable even while the backend is deliberately down, otherwise an outage cannot ` +
          `be ended`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolves, validates and caches the base URL. */
  private base(): string {
    if (this.baseUrl !== undefined) {
      return this.baseUrl;
    }

    const raw = this.resolveBaseUrl();
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(
        `HttpControlOptions.baseUrl '${raw}' is not an absolute URL. The control API address must ` +
          `include a scheme, for example http://localhost:32768`,
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      // "localhost:32768" parses cleanly, as a scheme of 'localhost:', so this is where a container
      // helper's "host:port" is actually caught rather than by the parse above.
      throw new Error(
        `HttpControlOptions.baseUrl '${raw}' must use http or https, not '${parsed.protocol}'. A ` +
          `container helper that returns "host:port" needs a scheme prepended, for example ` +
          `http://localhost:32768`,
      );
    }

    this.baseUrl = raw.replace(/\/+$/, '');
    return this.baseUrl;
  }
}
