import { Capability, NO_INTEGER_TYPE_IN_JAVASCRIPT } from './capability';
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
   * Four capabilities declared, one inapplicable, and every omission is a fact about the provider or
   * the language rather than a convenience:
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
   * - Targeting and Caching are absent because they are reserved rather than optional: no scenario
   *   carries either tag, so declaring one could not cause a skip and would put a capability
   *   nothing examined into the report. Naming one here is refused.
   *
   * ConfigurationChange *is* declared, and that is worth stating plainly: the JS in-memory provider
   * has putConfiguration and emits PROVIDER_CONFIGURATION_CHANGED, which the Go and Python SDKs'
   * equivalents do not. It is the reference behaviour Appendix A describes.
   *
   * LargeIntegers is declared because a JavaScript number holds 2^53 - 1 exactly and the in-memory
   * provider hands the value back untouched: there is no transport to round it on the way.
   */
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object, Capability.LargeIntegers],

  /*
   * NumericCoercion is not merely undeclared, it is inapplicable, and the conformance report
   * says so in its declaration rather than leaving the capability silently absent.
   *
   * **JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both 'number', the
   * Evaluation API exposes only getNumberDetails, and the in-memory provider type-checks with
   * `typeof value != typeof defaultValue`. Asking for float-flag as an Integer is therefore
   * indistinguishable from asking for it as a Float, so neither half of the coercion contract can
   * be put to a provider in this language: there is no lossless narrowing to permit and no lossy
   * one to reject — not because of a defect, but because the distinction does not exist here.
   *
   * Reporting that as an undeclared capability would show every JavaScript provider as missing
   * something no JavaScript provider can have. See the README.
   */
  notApplicable: { [Capability.NumericCoercion]: NO_INTEGER_TYPE_IN_JAVASCRIPT },
});
