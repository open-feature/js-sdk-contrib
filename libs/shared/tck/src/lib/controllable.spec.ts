import { Capability } from './capability';
import { ControllableBackendControl } from './controllable.testkit';
import { runProviderTck } from './runProviderTck';

/**
 * Runs the conformance suite against a provider that has a real initialisation, with no Docker.
 *
 * The suite that covers `lifecycle.feature` without a container — see `ControllableProvider` for why
 * `inMemory.spec.ts` cannot, and why these steps would otherwise run only through the Docker-gated
 * flagd adoption.
 *
 * A strict superset of `inMemory.spec.ts`'s coverage and not a replacement: that one stays the
 * **reference adoption** for a provider with no backend, and the thing an adopter copies.
 */
const control = new ControllableBackendControl();

runProviderTck({
  name: 'controllable',
  control,
  newProvider: () => control.newProvider(),
  newUnavailableProvider: () => control.newUnavailableProvider(),

  /*
   * The in-memory suite's set, plus the three this suite exists for:
   *
   * - Lifecycle, because initialisation reaches a store this provider does not already hold and can
   *   be refused by it, so READY is the observable outcome of that call;
   * - Reinitialization, because onClose drops the store and nothing else and there is no latch to
   *   make a second initialize return early;
   * - UnavailableInit, because newUnavailableProvider really does fail to initialise.
   *
   * Omitted: Stale, because this backend can refuse an *initialisation* but cannot take a store away
   * from a running provider and give it back, so the control implements no ConnectionControl — the
   * one capability with no Docker-free coverage here. Targeting, for the delegate's reason; see
   * `inMemory.spec.ts`.
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
    Capability.StandardReasons,
    Capability.StringTyping,
    Capability.FullyTypedValues,
  ],

  // Short, because no @unavailable scenario here involves a network: a refused store fails at once,
  // and the scenarios bound the error event at 10000ms, outside which a 30s default is useless.
  readyTimeoutMs: 5_000,
});
