import { MultiProvider } from '@openfeature/server-sdk';
import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * Runs the conformance suite against the SDK's multi-provider wrapping exactly one child.
 *
 * Delegation is where the contract is easiest to drop on the floor: a variant that does not survive
 * the hop, a reason rewritten to `DEFAULT`, an error code flattened to `GENERAL`, an event that never
 * reaches the client. Wrapping exactly one child makes each observable, the correct answer being what
 * the in-memory suite already asserts about that child alone, so any difference between the two
 * suites is the multi-provider's. It is a test that delegation is transparent, not of aggregation.
 *
 * NOT CURRENTLY RUN — excluded via `testPathIgnorePatterns` in this project's jest.config.ts, because
 * the SDK's MultiProvider replaces the child's error code with `GENERAL`: `collectProviderErrors`
 * builds an `ErrorWithCode` carrying the real code and `constructAggregateError` wraps it in an
 * `AggregateError extends GeneralError`, so it survives only inside `originalErrors[].error.code`,
 * which nothing reads. Everything else survives delegation intact. Kept rather than deleted because
 * it is the regression test: re-enabling it is deleting one line of jest.config.ts.
 */
const control = new InProcessControl();

runProviderTck({
  name: 'multi-provider',
  control,
  newProvider: () => new MultiProvider([{ provider: control.newProvider() }]),

  // The in-memory suite's set, and every declaration here is a transparency question: the child's
  // answer is asserted there, so a difference is the multi-provider's doing. Stale, UnavailableInit,
  // Lifecycle and Targeting are undeclared for the child's reasons -- see the in-memory suite.
  capabilities: [
    Capability.Events,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Variants,
    Capability.DisabledFlags,
    Capability.StandardReasons,
  ],
});
