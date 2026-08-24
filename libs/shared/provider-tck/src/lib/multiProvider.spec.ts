import { MultiProvider } from '@openfeature/server-sdk';
import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * NOT CURRENTLY RUN -- excluded via `testPathIgnorePatterns` in this project's jest.config.ts,
 * because the SDK's MultiProvider does not pass it. It fails 16 of 29 scenarios, every one of them
 * from a single root cause: the multi-provider replaces the child's error code with `GENERAL`
 * (15x TYPE_MISMATCH, 1x FLAG_NOT_FOUND). The information is not lost so much as thrown away --
 * `collectProviderErrors` builds an `ErrorWithCode` carrying the child's real code, and
 * `constructAggregateError` then wraps it in an `AggregateError extends GeneralError`, so the code
 * survives only inside `originalErrors[].error.code`, which nothing reads.
 *
 * Everything else passes, which is the useful half of the result: evaluation, variants, reasons and
 * configuration-change events all survive delegation intact.
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
 * attributable to the multi-provider and nothing else.
 *
 * That framing is why this belongs here rather than in the multi-provider's own tests: it is not a
 * test of aggregation across several backends, it is a test that delegation is transparent.
 *
 * The subject is deliberately `@openfeature/server-sdk`'s MultiProvider and not this repository's
 * `@openfeature/multi-provider`, which is deprecated in favour of it. Conformance-testing a package
 * nobody should adopt would prove little, and the same choice is made in the other languages: Go
 * tests `go-sdk/openfeature/multi` and Java tests `dev.openfeature.sdk.multiprovider`, both of whose
 * contrib equivalents are likewise deprecated. Python has no multi-provider in either place and so
 * has no such suite.
 *
 * The equivalent Java suite has to leave ConfigurationChange undeclared, because Java's
 * MultiProvider never subscribes to its children and swallows their events
 * (open-feature/java-sdk#1882). Whether this one forwards them is exactly what this suite is here to
 * find out.
 */
const control = new InProcessControl();

runProviderTck({
  name: 'multi-provider',
  control,
  newProvider: () => new MultiProvider([{ provider: control.newProvider() }]),

  // Same reasoning as the in-memory suite: no connection to lose, no backend for initialisation to
  // reach, and JavaScript has no integer type. Lifecycle stays undeclared for the same reason it
  // does there — neither the multi-provider nor its in-memory child does anything on startup, so
  // the readiness scenario was passing vacuously on synthesised PROVIDER_READY rather than on any
  // behaviour of this provider. ConfigurationChange is declared because the child emits it — if the
  // multi-provider does not forward it, this suite fails and that is the finding.
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
});
