import { Capability } from './capability';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';

/**
 * Runs the conformance suite against the SDK's own in-memory provider.
 *
 * This is the TCK's self-test, and it earns its keep twice over.
 *
 * It is the **reference adoption** for a provider with no backend: everything a file-based or
 * environment-variable provider has to write is here, and it is one call.
 *
 * It is also the **Docker-free canary**. Needing no container and no network, it runs in
 * milliseconds, which makes it the fast check that catches a broken step definition, a mis-wired
 * capability gate or a regression in the shared harness long before a containerised suite would.
 *
 * What it does not do is license providers that have a backend to test themselves this way — see
 * `BackendControl` for why.
 */
const control = new InProcessControl();

runProviderTck({
  name: 'in-memory',
  control,
  newProvider: () => control.newProvider(),

  /*
   * Seven capabilities, each declared on a run rather than on reading the SDK, and every omission a
   * fact about this provider:
   *
   * - ConfigurationChange: `putConfiguration` emits PROVIDER_CONFIGURATION_CHANGED, which is the
   *   reference behaviour Appendix A describes.
   * - LargeIntegers: a JavaScript number holds 2^53 - 1 exactly and the provider hands the value
   *   back untouched — there is no transport to round it on the way.
   * - Variants: the flag file gives every canonical flag its variants and the provider reports the
   *   matched one.
   * - DisabledFlags: with no backend to defer to, the caller's default is the only value the
   *   provider could return for a flag it declined to evaluate, and the decoder carries the state
   *   through so the four flags really are disabled underneath. Whether InMemoryProvider honours the
   *   state rather than serving the configured value anyway is not something reading it settles: the
   *   four rows pass.
   * - StandardReasons: seven of the nine scenarios run and all seven pass — STATIC for the four
   *   rule-less flags, ERROR for the unknown flag and the type mismatch, DISABLED for the disabled
   *   one. The two @targeting scenarios skip, the tags composing and Targeting being undeclared.
   *   STATIC for a rule-less flag is the row the specification leaves open, so it is measured.
   * - StringTyping and FullyTypedValues, declared together because the flag file gives every
   *   canonical flag a typed value and InMemoryProvider resolves per accessor, so
   *   `getStringDetails` on a boolean, a number or a structure is a TYPE_MISMATCH rather than that
   *   value's string representation. This is the capability's easy direction — there is no transport
   *   to stringify on the way — and it is measured rather than read off the provider: all four
   *   scenarios pass. A TypeScript object literal is as fully typed a store as exists, so the split
   *   between the two tags has nothing to separate here; the adoption it exists for is one whose
   *   backend types a boolean but not a float.
   *
   * - Stale and UnavailableInit are omitted because there is no connection to lose. InProcessControl
   *   does not implement ConnectionControl for the same reason, and the two omissions keep each
   *   other honest: the scenarios are skipped before a step can reach an operation it cannot
   *   perform.
   * - Lifecycle is omitted because there is no backend to reach: InMemoryProvider has no
   *   initialisation step and no onClose, so the SDK synthesises PROVIDER_READY and the readiness
   *   and shutdown scenarios would pass without demonstrating anything.
   * - Targeting is omitted because InMemoryProvider takes its rules from a `contextEvaluator`
   *   function and the canonical flag-definition format has no way to express one, so
   *   targeting-key-flag's `targeting` member is inert here. No KnownDeviation: nothing is broken.
   *   Synthesising a contextEvaluator to make the scenarios pass would test a fixture written for
   *   the occasion rather than a provider.
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
