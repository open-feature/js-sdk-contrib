import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * Runs the conformance suite against the SDK's own in-memory provider.
 *
 * The **reference adoption** for a provider with no backend — everything a file-based or
 * environment-variable provider has to write is here, in one call — and the **Docker-free canary**,
 * catching a broken step definition or a mis-wired capability gate in milliseconds.
 *
 * It does not license providers that have a backend to test themselves this way — see
 * `BackendControl`.
 */
const control = new InProcessControl();

runProviderTck({
  name: 'in-memory',
  control,
  newProvider: () => control.newProvider(),

  /*
   * Each declared on a run rather than on reading the SDK, and every omission a fact about this
   * provider:
   *
   * - ConfigurationChange, LargeIntegers, Variants and Object, which the SDK provider does plainly:
   *   `putConfiguration` emits the event, a JavaScript number holds 2^53 - 1 exactly, and there is
   *   no transport to lose a variant or round a value on.
   * - DisabledFlags, because with no backend to defer to the caller's default is the only value the
   *   provider could return — and measured rather than read off the provider: the rows pass.
   * - StandardReasons, measured the same way: every scenario that runs passes, the @targeting ones
   *   skipping on the composed tag.
   * - StringTyping and FullyTypedValues together, the flag file giving every flag a typed value and
   *   InMemoryProvider resolving per accessor. A TypeScript object literal is as fully typed a store
   *   as exists, so the split between the two tags has nothing to separate here.
   *
   * - Stale and UnavailableInit omitted, there being no connection to lose; InProcessControl
   *   implements no ConnectionControl for the same reason, so the scenarios skip before a step can
   *   reach an operation it cannot perform.
   * - Lifecycle omitted: InMemoryProvider has no initialisation step and no onClose, so the SDK
   *   synthesises PROVIDER_READY and those scenarios would pass demonstrating nothing.
   * - Targeting omitted: the canonical flag format cannot express an InMemoryProvider
   *   `contextEvaluator`, so the rule is inert here. No KnownDeviation — nothing is broken, and
   *   synthesising an evaluator would test a fixture written for the occasion.
   */
  capabilities: [
    Capability.Events,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Variants,
    Capability.DisabledFlags,
    Capability.StandardReasons,
    Capability.StringTyping,
    Capability.FullyTypedValues,
  ],
});
