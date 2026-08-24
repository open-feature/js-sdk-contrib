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
   * Four capabilities, and every omission is a fact about the provider or the language rather than a
   * convenience:
   *
   * - Stale and UnavailableInit are omitted because there is no connection to lose. InProcessControl
   *   does not implement ConnectionControl for the same reason, and the two omissions keep each
   *   other honest: the scenarios are skipped before any step can reach an operation the control
   *   cannot perform.
   * - StrictNumericTyping is omitted because **JavaScript has no integer type**. `typeof 10` and
   *   `typeof 0.5` are both 'number', the Evaluation API exposes only getNumberDetails, and the
   *   in-memory provider type-checks with `typeof value != typeof defaultValue`. Asking for
   *   float-flag as an Integer is therefore indistinguishable from asking for it as a Float, and no
   *   provider in this language can satisfy that scenario. This is a language property, not a bug —
   *   see the README.
   * - Targeting and Caching are omitted because no scenario carries their tags yet.
   *
   * ConfigurationChange *is* declared, and that is worth stating plainly: the JS in-memory provider
   * has putConfiguration and emits PROVIDER_CONFIGURATION_CHANGED, which the Go and Python SDKs'
   * equivalents do not. It is the reference behaviour Appendix A describes.
   */
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
});
