import { Capability } from './capability';
import { ControllableBackendControl } from './controllable.testkit';
import { runProviderTck } from './runProviderTck';

/**
 * Runs the conformance suite against a provider that has a real initialisation, with no Docker.
 *
 * This is the suite that covers `lifecycle.feature` without a container, and it exists because
 * `inMemory.spec.ts` cannot. The SDK's `InMemoryProvider` implements neither `initialize` nor
 * `onClose`, so the SDK's registry marks it `READY` on registration and the readiness scenario would
 * pass against it having demonstrated nothing — which is why that suite withholds
 * {@link Capability.Lifecycle}, and why it is right to.
 *
 * The consequence, until this file existed, was that **the shutdown and re-initialisation steps only
 * ever executed through the flagd adoption** — Docker-gated and excluded from CI, so in a normal run
 * nothing exercised them. Everything they assert had no coverage: that shutdown releases what
 * initialisation acquired, that it can be repeated, that it returns promptly against a backend that
 * is gone, and that a provider offering reuse really is reusable. A break in those step definitions
 * surfaced first inside a containerised provider suite, where a TCK defect looks like a provider
 * defect.
 *
 * `ControllableProvider` closes that gap by acquiring its flag store at `initialize()` time from a
 * store that may refuse it. The store is in this process rather than over a socket, so this is not a
 * licence for a provider that *does* have a backend to test itself this way — see `BackendControl`
 * for why. What it is, is the TCK exercising its own lifecycle steps in seconds, on any machine,
 * with no daemon.
 *
 * It is a strict superset of `inMemory.spec.ts`'s coverage and not a replacement for it: that one
 * stays the **reference adoption** for a provider with no backend, written against the published
 * `InProcessControl` and the SDK's own provider, and it is the thing an adopter copies.
 */
const control = new ControllableBackendControl();

runProviderTck({
  name: 'controllable',
  control,
  newProvider: () => control.newProvider(),
  newUnavailableProvider: () => control.newUnavailableProvider(),

  /*
   * `inMemory.spec.ts`'s six, plus the three this suite exists for. Each addition is a fact about
   * ControllableProvider rather than a convenience:
   *
   * - Lifecycle, because initialisation reaches a store this provider does not already hold and can
   *   be refused by it. READY is therefore the observable outcome of that call rather than something
   *   the SDK manufactured for a provider with no initialisation step, which is the distinction the
   *   tag exists to draw.
   * - Reinitialization, and only because it is true here: onClose drops the store and nothing else,
   *   initialize acquires a fresh one, and there is no latch that would make the second call return
   *   early. Requirement 2.5.2 only *permits* reuse, so a provider that released something it could
   *   not recreate would leave this undeclared rather than record a KnownDeviation.
   * - UnavailableInit, because newUnavailableProvider really does fail to initialise: its backend
   *   throws instead of answering, the SDK's registration promise rejects, and the three
   *   @unavailable scenarios run instead of skipping.
   *
   * The omissions are the in-memory suite's, because every resolution decision here is still the
   * SDK provider's — this class adds a lifecycle and delegates all evaluation:
   *
   * - Stale is omitted. This provider's backend can refuse an *initialisation*, which is what
   *   @unavailable needs, but it cannot take a store away from a running provider and give it back,
   *   which is what @stale needs. So this control does not implement ConnectionControl, the scenario
   *   is skipped before any step can reach an operation the control cannot perform, and @stale
   *   remains the one capability with no Docker-free coverage in any language. Adding it would mean
   *   this provider detecting a loss and emitting PROVIDER_STALE itself — worth doing, and a
   *   separate piece of work from covering the lifecycle steps.
   * - Targeting is omitted for the delegate's reason: InMemoryProvider takes its rules from a
   *   contextEvaluator function and the canonical flag file has no way to express one, so
   *   targeting-key-flag resolves its default variant whatever the context.
   * - NumericCoercion is omitted because JavaScript has no integer type — see Capability's own
   *   documentation, where that language fact is recorded once rather than per suite.
   * - Caching is reserved rather than optional, so it is not declarable and leaving it out skips
   *   nothing.
   */
  capabilities: [
    Capability.Events,
    Capability.Lifecycle,
    Capability.Reinitialization,
    Capability.UnavailableInit,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.Variants,
    Capability.DisabledFlags,
    Capability.LargeIntegers,
  ],

  /*
   * Short, because none of the @unavailable scenarios involves a network. A refused store fails at
   * once, so the default 30s would only ever be the time the suite waits before reporting a hang —
   * and the scenarios themselves bound the error event at 10000ms, which a 30s ceiling on the
   * registration call sits uselessly outside.
   */
  readyTimeoutMs: 5_000,
});
