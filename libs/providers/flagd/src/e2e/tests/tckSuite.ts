import type { Capability } from '@openfeature/provider-tck';
import { HttpControl, runProviderTck } from '@openfeature/provider-tck';
import type { ResolverType } from '../../lib/configuration';
import { FlagdProvider } from '../../lib/flagd-provider';
import { FlagdComposeContainer } from './flagdComposeContainer';

/**
 * The shared body of the two flagd conformance suites.
 *
 * flagd resolves flags two quite different ways — RPC evaluates remotely over gRPC, in-process syncs
 * the ruleset and evaluates locally — and they are separate suites because they are separately
 * conformant. Any difference between the two results is a difference an application would see when
 * it switches resolver, which is exactly the kind of thing the suite exists to surface.
 *
 * They are separate **files** for a mechanical reason on top of that: jest-cucumber accumulates step
 * definitions in module state, so two `runProviderTck` calls in one file would register the
 * vocabulary twice and every step would report as ambiguous.
 *
 * The existing e2e suites in this directory are untouched, and so is flagd-testbed. The TCK drives
 * the testbed's launchpad through the standardised control API, which the launchpad already
 * implements.
 */
export interface FlagdTckSuite {
  /** Identifies the suite in test output and scopes its OpenFeature domain. */
  name: string;

  /** Which resolver is under test. Also selects the container port the provider connects to. */
  resolverType: ResolverType;

  /** What the resolver supports, and — more importantly — what it does not. */
  capabilities: readonly Capability[];

  /** How long the provider may take to reach READY. */
  readyTimeoutMs: number;

  /**
   * Seconds the provider stays STALE before escalating to ERROR.
   *
   * It has to outlast the outage in the `@stale` scenario, which lasts as long as the suite takes to
   * assert the stale event and then call `/start` — bounded by {@link EVENT_TIMEOUT_MS}. Too short a
   * value would turn a scenario about staleness into one about failure.
   */
  retryGracePeriod: number;
}

/**
 * How long to wait for a provider event.
 *
 * flagd streams, so it sees an outage or a configuration change in well under a second; this is
 * headroom for a loaded CI machine rather than an expected latency.
 */
const EVENT_TIMEOUT_MS = 15_000;

/** Bounds a single scenario, which may register a provider and then await several events. */
const SCENARIO_TIMEOUT_MS = 120_000;

/** Bounds bringing the Compose stack up, which on a cold machine includes pulling the image. */
const STACK_TIMEOUT_MS = 180_000;

export function runFlagdTck(suite: FlagdTckSuite): void {
  jest.setTimeout(SCENARIO_TIMEOUT_MS);

  // Deliberately no jest.retryTimes, unlike the neighbouring flagd e2e suites: a conformance result
  // that only holds on the third attempt is not a conformance result. If a scenario is flaky here,
  // the timings above are the knob, or the flakiness is the finding.

  // The stack is started once for the whole suite and never restarted. Scenario isolation comes from
  // the control API instead — see the no-container-restart invariant in the control API
  // specification. Registered at the file's root scope, so it runs before the `beforeEach` that
  // runProviderTck installs inside its own describe block.
  const container = FlagdComposeContainer.build();

  beforeAll(async () => {
    await container.start();
  }, STACK_TIMEOUT_MS);

  afterAll(async () => {
    // Guarded because stop() throws on a stack that never came up, which would bury the startup
    // failure that is the actual finding under a second, misleading one.
    if (container.isStarted()) {
      await container.stop();
    }
  }, STACK_TIMEOUT_MS);

  // The launchpad's host port is mapped dynamically and does not exist until the stack is up, while
  // runProviderTck must be called at module load — hence the thunk. getLaunchpadUrl() returns
  // "host:port" with no scheme, and the control API address needs one.
  const control = new HttpControl({ baseUrl: () => `http://${container.getLaunchpadUrl()}` });

  runProviderTck({
    name: suite.name,
    control,

    // Read inside the factory, not above it: the testbed maps host ports dynamically, so they do not
    // exist until the stack is up. They stay valid for the whole suite because nothing restarts a
    // container.
    //
    // The timings other than retryGracePeriod are the ones the neighbouring flagd e2e suites already
    // use, where they are described as optimised for test speed and stability.
    newProvider: () =>
      new FlagdProvider({
        resolverType: suite.resolverType,
        host: 'localhost',
        port: container.getPort(suite.resolverType),
        deadlineMs: 15000,
        keepAliveTime: 200,
        retryBackoffMs: 100,
        retryBackoffMaxMs: 500,
        retryGracePeriod: suite.retryGracePeriod,
      }),

    // Pointed at a closed port on localhost, never at the backend under test — that has to stay up,
    // and simulated outages belong to the control API. The deadlines are deliberately short: the
    // scenario asserts that failure is reported promptly, so a provider that took 30 seconds to give
    // up would pass a test about eventual failure and fail the one that matters. A one-second grace
    // period is what turns the initial STALE into the ERROR the scenario waits for.
    newUnavailableProvider: () =>
      new FlagdProvider({
        resolverType: suite.resolverType,
        host: 'localhost',
        port: 9999,
        deadlineMs: 500,
        retryBackoffMs: 100,
        retryBackoffMaxMs: 500,
        retryGracePeriod: 1,
      }),

    capabilities: suite.capabilities,
    readyTimeoutMs: suite.readyTimeoutMs,
    eventTimeoutMs: EVENT_TIMEOUT_MS,
  });
}
