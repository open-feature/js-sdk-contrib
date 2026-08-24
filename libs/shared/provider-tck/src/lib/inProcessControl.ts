import { InMemoryProvider } from '@openfeature/server-sdk';
import type { BackendControl } from './control';
import { CHANGING_BASELINE, CHANGING_CHANGED, canonicalFlagSet } from './flags';

/**
 * A {@link BackendControl} that manipulates an in-process provider directly, with no backend, no
 * container and no HTTP.
 *
 * This exists so providers with nothing to connect to — in-memory, environment-variable and
 * file-based providers — can run the TCK. For those, "the backend" is a data structure in the same
 * process: seeding flags is building an object, and changing one is `putConfiguration` on the live
 * provider, so the event the suite awaits is the provider's own `PROVIDER_CONFIGURATION_CHANGED`
 * rather than one the TCK synthesised.
 *
 * **This is not a shortcut for providers that do have a backend.** Reaching into an external backend
 * from inside the test process — a test-only admin client, a shared database handle, a hook in the
 * provider — produces a suite that passes while proving nothing, because the path it exercised is
 * not the path the contract describes. Those providers drive the HTTP control API instead.
 *
 * ## Connection control
 *
 * `InProcessControl` deliberately does not implement {@link ConnectionControl}. An in-memory
 * provider has no connection to lose, and pretending otherwise with a no-op would report the
 * `@stale` scenarios as passed. A suite using it leaves {@link Capability.Stale} and
 * {@link Capability.UnavailableInit} undeclared, and those scenarios are reported as skipped.
 *
 * {@link Capability.Lifecycle} goes undeclared for the neighbouring reason: with no backend, there
 * is no initialisation to reach one. The SDK synthesises `PROVIDER_READY` for such a provider, so
 * declaring it would report the readiness scenario as passed without anything having been proved.
 *
 * ## Ownership of the provider
 *
 * This class both seeds the flags and creates the provider that serves them, because in-process they
 * are the same object: {@link changeFlag} has to reach the live instance to emit an event from it.
 * A suite therefore wires both through one control:
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

  /**
   * Creates the provider for the scenario about to run, seeded with the canonical flag set.
   *
   * Each call returns a fresh instance over a fresh copy of the baseline, which is what makes
   * {@link prepareScenario} nothing more than dropping the previous reference.
   */
  newProvider(): InMemoryProvider {
    this.changingVariant = CHANGING_BASELINE;
    this.current = new InMemoryProvider(canonicalFlagSet(this.changingVariant));
    return this.current;
  }

  /**
   * Drops the reference to the previous scenario's provider.
   *
   * That is the whole reset: the flag set is rebuilt per provider, so the {@link newProvider} call
   * that follows starts from an untouched baseline. Clearing the reference rather than leaving it
   * dangling means a scenario that changes flags without creating a provider fails with a clear
   * message instead of mutating one that has already been closed.
   */
  async prepareScenario(): Promise<void> {
    this.current = undefined;
  }

  /**
   * Flips `changing-flag` between its two variants on the live provider.
   *
   * The event the suite awaits is therefore the provider's own `PROVIDER_CONFIGURATION_CHANGED`,
   * carrying `changing-flag` in `flagsChanged`, and not a signal the TCK synthesised.
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
