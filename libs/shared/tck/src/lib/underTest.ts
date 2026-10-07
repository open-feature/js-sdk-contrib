import type { Client, Provider } from '@openfeature/server-sdk';
import type { TckState } from './state';

/**
 * The suite running in this module registry, or `undefined` before `runProviderTck` has been called.
 *
 * Module scope is the right scope: jest-cucumber binds step definitions as module-level closures,
 * so an extension step has module scope and nothing else to close over, and Jest gives every test
 * file its own module registry. "The suite in this module" is therefore "the suite in this file", and
 * a second suite in the same file is refused below rather than allowed to overwrite the first.
 */
let current: TckState | undefined;

/**
 * Records the suite an extension step will reach, called by `runProviderTck`.
 *
 * Internal: not exported from the package. An adopter reaches the suite through
 * {@link clientUnderTest} and {@link providerUnderTest} instead.
 */
export function registerSuiteUnderTest(state: TckState): void {
  if (current && current !== state) {
    throw new Error(
      'tck: runProviderTck was called twice in one file. jest-cucumber accumulates step ' +
        'definitions in module state, so the second call registers the whole vocabulary again and ' +
        'every step reports as ambiguous; clientUnderTest() would also have to choose between two ' +
        'suites. Put each suite in its own .spec.ts file -- two resolvers means two files.',
    );
  }
  current = state;
}

/** Forgets the registered suite. Test-only, so one spec file can exercise several registrations. */
export function resetSuiteUnderTest(): void {
  current = undefined;
}

function requireSuite(accessor: string): TckState {
  if (!current) {
    throw new Error(
      `tck: ${accessor} was called before runProviderTck. It reads the suite registered in this ` +
        `file, so it only means anything from inside a step definition -- reading it at module ` +
        `load, before the suite exists, is the usual cause.`,
    );
  }
  return current;
}

/**
 * The OpenFeature client for the provider under test, for use from an extension step definition.
 *
 * The provider is registered under a suite-scoped domain the adopter never sees, so this is the only
 * route to it: a client of the adopter's own resolves against a *different* provider than the one the
 * suite is testing, and so answers a different question than the scenario asked.
 *
 * ```ts
 * const fractionalSteps: StepDefinitions = ({ then }) => {
 *   then(/^the fractional rule serves "([^"]*)"$/, async (expected: string) => {
 *     expect(await clientUnderTest().getStringValue('fractional-flag', 'none')).toBe(expected);
 *   });
 * };
 * ```
 *
 * It throws before the scenario has registered a provider — before a `Given a stable provider` step
 * — so put one in a `Background`, as the canonical features and the extension fixture both do.
 *
 * @throws if called outside a suite, or before the scenario registered a provider.
 */
export function clientUnderTest(): Client {
  return requireSuite('clientUnderTest()').requireClient();
}

/**
 * The provider instance under test, as this scenario's factory produced it.
 *
 * {@link clientUnderTest} is the one to reach for, because it is how an application would use the
 * provider. This is for a step whose subject is the provider's own surface rather than the SDK's
 * handling of it — a vendor-specific configuration call the SDK has no word for, say.
 *
 * A fresh instance per scenario, so hold it no longer than the step that asked for it.
 *
 * @throws if called outside a suite, or before the scenario created a provider.
 */
export function providerUnderTest(): Provider {
  return requireSuite('providerUnderTest()').requireProvider();
}
