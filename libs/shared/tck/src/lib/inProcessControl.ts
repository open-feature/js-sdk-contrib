import { InMemoryProvider } from '@openfeature/server-sdk';
import type { BackendControl } from './control';
import { CHANGING_BASELINE, CHANGING_CHANGED, canonicalFlagSet } from './flags';

/**
 * A {@link BackendControl} that manipulates an in-process provider directly, with no backend, no
 * container and no HTTP.
 *
 * For providers with nothing to connect to — in-memory, environment-variable, file-based — "the
 * backend" is a data structure in the same process. **This is not a shortcut for providers that do
 * have a backend**; see Appendix F, "Providers with no backend".
 *
 * It deliberately does not implement {@link ConnectionControl}: an in-memory provider has no
 * connection to lose, so a suite using it leaves {@link Capability.Stale} and
 * {@link Capability.UnavailableInit} undeclared and those scenarios skip with the reason.
 *
 * It both seeds the flags and creates the provider that serves them, because in-process they are the
 * same object — {@link changeFlag} has to reach the live instance to emit an event from it — so a
 * suite wires both through one control:
 *
 * ```ts
 * const control = new InProcessControl();
 * runProviderTck({
 *   name: 'in-memory',
 *   control,
 *   newProvider: () => control.newProvider(),
 *   capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
 * });
 * ```
 */
export class InProcessControl implements BackendControl {
  private current: InMemoryProvider | undefined;
  private changingVariant: string = CHANGING_BASELINE;

  readonly description = 'in-process control of the SDK in-memory provider';

  /** There is no backend, which is the whole reason this class exists. */
  readonly controlApi = 'in-process' as const;

  /**
   * Creates the provider for the scenario about to run, seeded with the canonical flag set. Each
   * call is a fresh instance over a fresh copy of the baseline, which is what makes
   * {@link prepareScenario} nothing more than dropping the previous reference.
   */
  newProvider(): InMemoryProvider {
    this.changingVariant = CHANGING_BASELINE;
    this.current = new InMemoryProvider(canonicalFlagSet(this.changingVariant));
    return this.current;
  }

  /**
   * Drops the reference to the previous scenario's provider, which is the whole reset: the flag set
   * is rebuilt per provider, so the {@link newProvider} call that follows starts from an untouched
   * baseline. Clearing rather than leaving it dangling makes a scenario that changes flags without
   * creating a provider fail with a clear message instead of mutating a closed one.
   */
  async prepareScenario(): Promise<void> {
    this.current = undefined;
  }

  /**
   * Flips `changing-flag` between its two variants on the live provider, so the event the suite
   * awaits is the provider's own `PROVIDER_CONFIGURATION_CHANGED` and not one the TCK synthesised.
   *
   * Alternating rather than assigning a fixed variant keeps repeated calls within one scenario
   * meaningful; the suite asserts that the resolved value differs, not what it became.
   */
  async changeFlag(): Promise<void> {
    if (!this.current) {
      throw new Error(
        'No in-memory provider exists for this scenario. In-process control manipulates the ' +
          'provider itself, so the scenario must create one — with "Given a stable provider" — ' +
          'before any step that changes flag state.',
      );
    }

    this.changingVariant = this.changingVariant === CHANGING_CHANGED ? CHANGING_BASELINE : CHANGING_CHANGED;
    this.current.putConfiguration(canonicalFlagSet(this.changingVariant));
  }
}
