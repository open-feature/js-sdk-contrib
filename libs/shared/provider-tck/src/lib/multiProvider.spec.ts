import { MultiProvider } from '@openfeature/multi-provider';
import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * NOT CURRENTLY RUN -- excluded via `testPathIgnorePatterns` in this project's jest.config.ts.
 *
 * This suite fails 24 of 29 scenarios, and the failures are real. `MultiProvider` keys the
 * evaluation context by object identity, so an ordinary context-free evaluation returns the code
 * default with `GENERAL`; and it flattens `TYPE_MISMATCH` to `GENERAL`. Both are tracked in
 * https://github.com/open-feature/js-sdk-contrib/issues/1609.
 *
 * It is excluded rather than deleted so that a defect in another library does not block the
 * conformance suite's own adoption, and so that this file is the regression test for #1609 --
 * re-enabling it is a one-line change once the provider is fixed.
 *
 * Runs the conformance suite against the multi-provider wrapping exactly one child.
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
