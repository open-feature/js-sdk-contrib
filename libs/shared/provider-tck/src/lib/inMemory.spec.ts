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
   * Five capabilities declared, and every omission is a fact about the provider or the language
   * rather than a convenience:
   *
   * - Stale and UnavailableInit are omitted because there is no connection to lose. InProcessControl
   *   does not implement ConnectionControl for the same reason, and the two omissions keep each
   *   other honest: the scenarios are skipped before any step can reach an operation the control
   *   cannot perform.
   * - Lifecycle is omitted because there is no backend to reach. InMemoryProvider has no
   *   initialisation step, so the SDK synthesises PROVIDER_READY for it and the readiness scenario
   *   would pass without demonstrating anything — a NoOpProvider passes it identically. It was
   *   passing vacuously while lifecycle.feature was gated by @events; now the skip says so. The
   *   shutdown scenarios go with it: InMemoryProvider has no onClose and no initialize, so calling
   *   them directly would prove as little as the readiness scenario did.
   * - Targeting is omitted because the in-memory provider cannot have it from this flag file.
   *   InMemoryProvider takes its rules from a `contextEvaluator` function, and the canonical
   *   flag-definition format has no way to express one — so targeting-key-flag's `targeting` member
   *   is inert here and the flag resolves its default variant whatever the context. Leaving the
   *   capability undeclared is the honest report, and the right one: a KnownDeviation would assert a
   *   defect, and nothing here is broken. Synthesising a contextEvaluator to make the scenarios pass
   *   would be worse still — it would test a fixture written for the occasion rather than a
   *   provider, which is the vacuous pass this suite exists to prevent.
   * - Caching is absent because it is reserved rather than optional: no scenario carries the tag, so
   *   declaring it could not cause a skip and would put a capability nothing examined into the
   *   report. Naming it here is refused.
   *
   * ConfigurationChange *is* declared, and that is worth stating plainly: the JS in-memory provider
   * has putConfiguration and emits PROVIDER_CONFIGURATION_CHANGED, which the Go and Python SDKs'
   * equivalents do not. It is the reference behaviour Appendix A describes.
   *
   * LargeIntegers is declared because a JavaScript number holds 2^53 - 1 exactly and the in-memory
   * provider hands the value back untouched: there is no transport to round it on the way.
   *
   * Variants is declared because InMemoryProvider resolves through a named variant and reports the
   * name: the flag file gives every canonical flag its variants, and the provider hands the matched
   * one back. Requirement 2.2.4 is only a SHOULD, so this is a claim rather than a given — and it is
   * made on the run below going green, not on having read the SDK.
   */
  capabilities: [
    Capability.Events,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Variants,
  ],

  /*
   * NumericCoercion is left undeclared, so its three scenarios are skipped with that reason.
   *
   * **JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both 'number', the
   * Evaluation API exposes only getNumberDetails, and the in-memory provider type-checks with
   * `typeof value != typeof defaultValue`. Asking for float-flag as an Integer is therefore
   * indistinguishable from asking for it as a Float, so neither half of the coercion contract can
   * be put to a provider in this language — not because of a defect, but because the distinction
   * does not exist here.
   *
   * That is a property of the language rather than of this provider, so it is stated once against
   * Capability.NumericCoercion and in Appendix F rather than restated in this suite's report.
   */
});
