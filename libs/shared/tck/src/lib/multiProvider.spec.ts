import { MultiProvider } from '@openfeature/server-sdk';
import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * NOT CURRENTLY RUN -- excluded via `testPathIgnorePatterns` in this project's jest.config.ts,
 * because the SDK's MultiProvider does not pass it. It fails 18 of the 50 scenarios it runs -- 65
 * in the canonical set, 15 skipped by the declaration below -- and every one of them comes from a
 * single root cause: the multi-provider replaces the child's error code with `GENERAL`
 * (16x TYPE_MISMATCH, 2x FLAG_NOT_FOUND). The information is not lost so much as thrown away --
 * `collectProviderErrors` builds an `ErrorWithCode` carrying the child's real code, and
 * `constructAggregateError` then wraps it in an `AggregateError extends GeneralError`, so the code
 * survives only inside `originalErrors[].error.code`, which nothing reads.
 *
 * Everything else passes, which is the useful half of the result: evaluation, variants, reasons,
 * disabled flags and configuration-change events all survive delegation intact. The two new
 * failures since `reason.feature` arrived are that same error code and not a reason: both scenarios
 * assert the pair, the reason `ERROR` reaches the caller and the code beside it does not.
 *
 * This is kept, not deleted, because it is the regression test -- re-enabling it is deleting one
 * line of jest.config.ts.
 *
 * Runs the conformance suite against the SDK's multi-provider wrapping exactly one child.
 *
 * A provider that delegates is still a provider, and delegation is where the contract is easiest to
 * drop on the floor: a variant that does not survive the hop, a reason rewritten to `DEFAULT`, an
 * error code flattened to `GENERAL`, an event that never reaches the client. Wrapping exactly one
 * child makes each of those observable, because the correct answer is precisely what the in-memory
 * suite already asserts about the child on its own. Any difference between the two suites is
 * attributable to the multi-provider and nothing else -- which is why this belongs here rather than
 * in the multi-provider's own tests: it is not a test of aggregation across several backends, it is
 * a test that delegation is transparent.
 *
 * The subject is deliberately `@openfeature/server-sdk`'s MultiProvider and not this repository's
 * `@openfeature/multi-provider`, which is deprecated in favour of it: conformance-testing a package
 * nobody should adopt would prove little.
 */
const control = new InProcessControl();

runProviderTck({
  name: 'multi-provider',
  control,
  newProvider: () => new MultiProvider([{ provider: control.newProvider() }]),

  // The same set as the in-memory suite, and every declaration here is a transparency question: the
  // child's answer is already asserted there, so a difference is the multi-provider's doing.
  // ConfigurationChange, because the child emits it and a wrapper that does not forward it fails
  // here. LargeIntegers, because the child resolves 2^53 - 1 exactly and a rounded value on the way
  // through would be the wrapper's. Variants, because a multi-provider assembles its own resolution
  // details from a child's and dropping the variant while carrying the value is an easy thing to do.
  // DisabledFlags, because a disabled flag is a resolution the child declined, and a wrapper
  // treating "no value" as an error rather than as the caller's default is caught here and nowhere
  // else. StandardReasons, because a reason rewritten to DEFAULT on the way through is exactly what
  // delegation drops on the floor.
  //
  // Stale, UnavailableInit, Lifecycle and Targeting are undeclared for the child's reasons -- see
  // the in-memory suite; neither the wrapper nor its child has a connection, an initialisation or a
  // contextEvaluator.
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
