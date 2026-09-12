import { join } from 'node:path';
import type { Capability } from '@openfeature/tck';
import { runContainerizedProviderTck } from '@openfeature/tck';
import type { ResolverType } from '../../lib/configuration';
import { FlagdProvider } from '../../lib/flagd-provider';

/**
 * The shared body of the two flagd conformance suites.
 *
 * flagd resolves flags two quite different ways — RPC evaluates remotely over gRPC, in-process syncs
 * the ruleset and evaluates locally — and they are separate suites because they are separately
 * conformant. Any difference between the two results is a difference an application would see when
 * it switches resolver, which is exactly the kind of thing the suite exists to surface.
 *
 * They are separate **files** for a mechanical reason on top of that: jest-cucumber accumulates step
 * definitions in module state, so two suites in one file would register the vocabulary twice and
 * every step would report as ambiguous.
 *
 * The existing e2e suites in this directory are untouched, and so is flagd-testbed. The suite drives
 * the testbed's launchpad through the standardised control API, which the launchpad already
 * implements, and brings the stack up itself from `../tck/docker-compose.yaml`.
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
}

/** The container-internal port each resolver connects to, both served by the one testbed service. */
const RESOLVER_PORT: Record<ResolverType, number> = {
  rpc: 8013,
  'in-process': 8015,
};

/**
 * How long to wait for a provider event.
 *
 * flagd streams, so it sees an outage or a configuration change in well under a second; this is
 * headroom for a loaded CI machine rather than an expected latency.
 */
const EVENT_TIMEOUT_MS = 15_000;

/**
 * Seconds the provider stays STALE before escalating to ERROR.
 *
 * It has to outlast the outage in the `@stale` scenario, which lasts as long as the suite takes to
 * assert the stale event and then call `/start` — bounded by {@link EVENT_TIMEOUT_MS}. Too short a
 * value would turn a scenario about staleness into one about failure. The same in both resolvers,
 * because the grace period lives in the shared provider layer rather than in either transport.
 */
const RETRY_GRACE_PERIOD_SECONDS = 30;

/**
 * Budget for the Compose stack and its control API to become reachable.
 *
 * Well above the suite's 60-second default because on a cold machine this includes pulling the
 * testbed image, which the budget is specified to cover.
 */
const STACK_TIMEOUT_MS = 180_000;

export function runFlagdTck(suite: FlagdTckSuite): void {
  const backendPort = RESOLVER_PORT[suite.resolverType];

  // Deliberately no jest.retryTimes, unlike the neighbouring flagd e2e suites: a conformance result
  // that only holds on the third attempt is not a conformance result. If a scenario is flaky here,
  // the timings above are the knob, or the flakiness is the finding.
  runContainerizedProviderTck({
    name: suite.name,

    // The suite owns the stack: started once before the first scenario and never restarted, with
    // scenario isolation coming from the control API instead. See the no-container-restart
    // invariant in the control API specification.
    composeFile: join(__dirname, '..', 'tck', 'docker-compose.yaml'),
    backendPorts: [backendPort],
    startupTimeoutMs: STACK_TIMEOUT_MS,

    // The endpoint carries the dynamically mapped host port, which does not exist until the stack
    // is up -- hence a factory. It stays valid for the whole suite because nothing restarts a
    // container.
    //
    // The timings other than the grace period are the ones the neighbouring flagd e2e suites
    // already use, where they are described as optimised for test speed and stability.
    newProvider: (endpoint) =>
      new FlagdProvider({
        resolverType: suite.resolverType,
        host: endpoint.host,
        port: endpoint.port(backendPort),
        deadlineMs: 15000,
        keepAliveTime: 200,
        retryBackoffMs: 100,
        retryBackoffMaxMs: 500,
        retryGracePeriod: RETRY_GRACE_PERIOD_SECONDS,
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
