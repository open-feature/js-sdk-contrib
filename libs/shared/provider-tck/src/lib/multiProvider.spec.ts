import { MultiProvider } from '@openfeature/multi-provider';
import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
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

  // Same reasoning as the in-memory suite: no connection to lose, and JavaScript has no integer
  // type. ConfigurationChange is declared because the child emits it — if the multi-provider does
  // not forward it, this suite fails and that is the finding.
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
});
