import type { Client, Provider } from '@openfeature/server-sdk';
import type { TckState } from './state';

/**
 * The suite running in this module registry, or `undefined` before `runProviderTck` has been
 * called.
 *
 * Module scope is the right scope, not a compromise. jest-cucumber binds step definitions as
 * module-level closures — that is what `StepDefinitions` *is*, a function handed `given`/`when`/
 * `then` at bind time — so an extension step has module scope and nothing else to close over. Jest
 * gives every test file its own module registry, and the suite already documents one
 * `runProviderTck` call per file because jest-cucumber accumulates its vocabulary in module state.
 * So "the suite in this module" and "the suite in this file" are the same thing, and a second suite
 * in the same file is refused below rather than allowed to overwrite the first.
 */
let current: TckState | undefined;

/**
 * Records the suite an extension step will reach, called by `runProviderTck`.
 *
 * Internal: not exported from the package. An adopter never names the state object, which is why
 * {@link clientUnderTest} and {@link providerUnderTest} exist instead of an exported accessor for
 * it — see their documentation.
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
 * This is the seam that makes an extension step worth running inside the suite rather than beside
 * it. The provider is registered under a suite-scoped domain the adopter never sees, so without
 * this an extension step could observe the lifecycle the suite set up but not use it, and the only
 * way to evaluate a flag would be to build a second client — which resolves against a *different*
 * provider than the one the suite is testing, and so answers a different question than the scenario
 * asked. Every other language's suite has the same route: Go's `tck.ClientFromContext`, Java's
 * injected `TckState`, Python's `tck_state` fixture.
 *
 * ```ts
 * const fractionalSteps: StepDefinitions = ({ then }) => {
 *   then(/^the fractional rule serves "([^"]*)"$/, async (expected: string) => {
 *     expect(await clientUnderTest().getStringValue('fractional-flag', 'none')).toBe(expected);
 *   });
 * };
 * ```
 *
 * It throws before the scenario has registered a provider, which in the canonical vocabulary means
 * before a `Given a stable provider` step. Put one in a `Background`, as the canonical features and
 * the extension fixture both do.
 *
 * @throws if called outside a suite, or before the scenario registered a provider.
 */
export function clientUnderTest(): Client {
  return requireSuite('clientUnderTest()').requireClient();
}

/**
 * The provider instance under test, as this scenario's factory produced it.
 *
 * {@link clientUnderTest} is the one to reach for: it is how an application would use the provider,
 * so a step that goes through it asserts something an application could observe. This is for the
 * cases the canonical lifecycle and metadata steps also handle this way — a step whose subject is
 * the provider's own surface rather than the SDK's handling of it, such as a vendor-specific
 * configuration call the SDK has no word for.
 *
 * A fresh instance per scenario, so hold it no longer than the step that asked for it.
 *
 * @throws if called outside a suite, or before the scenario created a provider.
 */
export function providerUnderTest(): Provider {
  return requireSuite('providerUnderTest()').requireProvider();
}
