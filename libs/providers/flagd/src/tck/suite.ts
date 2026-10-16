import { join } from 'node:path';
import type { Capability } from '@openfeature/tck';
import { runContainerizedProviderTck } from '@openfeature/tck';
import type { ResolverType } from '../lib/configuration';
import { FlagdProvider } from '../lib/flagd-provider';

/**
 * The shared body of the two flagd conformance suites, one per resolver: RPC evaluates remotely over
 * gRPC, in-process syncs the ruleset and evaluates locally, and they are separately conformant.
 *
 * They must stay separate *files*: jest-cucumber accumulates step definitions in module state, so
 * two suites in one file register the vocabulary twice and every step reports as ambiguous.
 */
export interface FlagdTckSuite {
  /** Identifies the suite in test output and scopes its OpenFeature domain. */
  name: string;

  /** Which resolver is under test. Also selects the container port the provider connects to. */
  resolverType: ResolverType;

  /** What the resolver supports, and what it does not. */
  capabilities: readonly Capability[];

  /** How long the provider may take to reach READY. */
  readyTimeoutMs: number;
}

/** The container-internal port each resolver connects to, both served by the one testbed service. */
const RESOLVER_PORT: Record<ResolverType, number> = {
  rpc: 8013,
  'in-process': 8015,
};

/** The backend stack, shared with the OFREP adoption — see its header. */
const COMPOSE_FILE = join(__dirname, '..', '..', '..', '..', 'shared', 'tck-backend', 'docker-compose.yaml');

/** flagd streams, so this is headroom for a loaded CI machine rather than an expected latency. */
const EVENT_TIMEOUT_MS = 15_000;

/**
 * Seconds the provider stays STALE before escalating to ERROR. It has to outlast the outage in the
 * `@stale` scenario, bounded by {@link EVENT_TIMEOUT_MS}; too short a value turns a scenario about
 * staleness into one about failure.
 */
const RETRY_GRACE_PERIOD_SECONDS = 30;

/** Well above the suite's 60-second default: on a cold machine this includes pulling the image. */
const STACK_TIMEOUT_MS = 180_000;

export function runFlagdTck(suite: FlagdTckSuite): void {
  const backendPort = RESOLVER_PORT[suite.resolverType];

  // Deliberately no jest.retryTimes, unlike the neighbouring flagd e2e suites: a conformance result
  // that only holds on the third attempt is not a conformance result. If a scenario is flaky here,
  // the timings above are the knob, or the flakiness is the finding.
  runContainerizedProviderTck({
    name: suite.name,
    composeFile: COMPOSE_FILE,
    backendPorts: [backendPort],
    startupTimeoutMs: STACK_TIMEOUT_MS,

    // Timings other than the grace period are the ones the neighbouring flagd e2e suites use.
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

    // A closed port, never the backend under test. The short deadlines are deliberate: the scenario
    // asserts that failure is reported promptly, and the one-second grace period is what turns the
    // initial STALE into the ERROR it waits for.
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
