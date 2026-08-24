import type { Provider } from '@openfeature/server-sdk';
import type { Capability } from './capability';
import type { BackendControl } from './control';

/** Creates a provider under test. */
export type ProviderFactory = () => Provider | Promise<Provider>;

export const DEFAULT_EVENT_TIMEOUT_MS = 12_000;
export const DEFAULT_READY_TIMEOUT_MS = 30_000;

/**
 * The entire contract a provider author implements to run the TCK.
 *
 * Three fields are required — a name, a provider factory, and the seam through which the backend is
 * manipulated. Everything else has a working default.
 *
 * The TCK owns the provider lifecycle from here: it registers each provider with the OpenFeature API
 * under a suite-scoped domain, waits for it to become ready, and closes it at the end. Do not call
 * `OpenFeature.setProvider` yourself.
 */
export interface TckOptions {
  /**
   * Identifies the suite in test output, and scopes the OpenFeature domain the TCK registers
   * providers under so two suites in the same run do not observe each other's providers.
   *
   * Use something that reads well in a failure message: `'flagd-rpc'`, `'in-memory'`.
   */
  name: string;

  /**
   * Creates the provider under test, configured against a backend that is already running and
   * seeded with the canonical flag set. Called once per scenario.
   *
   * A factory rather than a single instance because each scenario gets its own provider, and
   * because a provider often cannot be configured before the suite starts — a container stack's host
   * ports do not exist until it is up.
   */
  newProvider: ProviderFactory;

  /**
   * The seam through which the TCK manipulates the backend.
   *
   * See {@link BackendControl} for which implementation is right for your provider.
   */
  control: BackendControl;

  /**
   * Creates a provider pointed at a backend that does not exist.
   *
   * Used by the initialisation-failure scenarios, which assert that a provider unable to reach its
   * backend settles into `ERROR` rather than hanging or throwing out of registration.
   *
   * Point it at a closed port on localhost. Do not point it at the backend under test — that must
   * stay up, and simulated outages belong to {@link control}. Configure a short connection deadline:
   * the scenario allows a bounded time for the error event, and a provider with a 30-second connect
   * timeout will not make it.
   *
   * Required only if {@link capabilities} includes {@link Capability.UnavailableInit}.
   */
  newUnavailableProvider?: ProviderFactory;

  /**
   * Which optional parts of the provider contract this provider supports.
   *
   * Scenarios tagged with an undeclared capability are reported as skipped, with the reason in the
   * test name — never as passed. Defaults to every capability; narrow it rather than widening it.
   */
  capabilities?: readonly Capability[];

  /**
   * How long to wait for a provider event, in milliseconds.
   *
   * The single most important knob for a provider author, because providers observe backend changes
   * on wildly different timescales. A streaming provider sees a configuration change in
   * milliseconds; one polling every 30 seconds may need most of a poll interval. Set it to
   * comfortably exceed your worst-case detection latency, or the suite reports timeouts that are
   * really just impatience.
   *
   * Scenarios can tighten this with the explicit `within {int}ms` step, which always wins.
   *
   * @default 12000
   */
  eventTimeoutMs?: number;

  /**
   * How long to wait for a provider to reach `READY` during initialisation, in milliseconds.
   *
   * @default 30000
   */
  readyTimeoutMs?: number;
}

/**
 * The OpenFeature domain a suite registers its providers under.
 *
 * Suite-scoped rather than scenario-scoped on purpose. Registering a new provider in the same domain
 * replaces the previous one; a fresh domain per scenario would leave every provider of the suite
 * registered, which for a provider holding a network connection means leaking one connection per
 * scenario.
 */
export function domainFor(options: TckOptions): string {
  return `provider-tck/${options.name}`;
}

export function eventTimeout(options: TckOptions): number {
  return options.eventTimeoutMs ?? DEFAULT_EVENT_TIMEOUT_MS;
}

export function readyTimeout(options: TckOptions): number {
  return options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
}
