import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { ALL_CAPABILITIES, Capability, capabilityForTag } from './capability';
import type { TckOptions } from './options';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';

/**
 * The glob matching the canonical feature files.
 *
 * Workspace-relative, matching `getGherkinTestPath` in `@openfeature/flagd-core`: Nx runs Jest from
 * the workspace root, and this is the established way a shared library in this repo hands its
 * Gherkin to a consuming suite. It does mean the path is only correct for consumers inside this
 * workspace — see the README's known gaps.
 */
export const FEATURES_GLOB = 'libs/shared/provider-tck/features/*.feature';

/** The canonical flag set, as raw JSON, for a suite that seeds a backend from it. */
export const CANONICAL_FLAGS_PATH = 'libs/shared/provider-tck/flags/canonical-flags.json';

/** The OpenAPI document a containerised backend under test must implement. */
export const CONTROL_API_PATH = 'libs/shared/provider-tck/openapi/control-api.yaml';

/**
 * Runs the OpenFeature Provider Conformance Suite against the provider described by `options`.
 *
 * Call it once at the top level of a `.spec.ts` file. Every scenario becomes a Jest test, so `-t`
 * selects one and failures name a scenario.
 *
 * ```ts
 * const control = new InProcessControl();
 *
 * runProviderTck({
 *   name: 'in-memory',
 *   control,
 *   newProvider: () => control.newProvider(),
 *   capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
 * });
 * ```
 *
 * One suite per file. jest-cucumber accumulates step definitions in module state, so two calls in
 * the same file would register the vocabulary twice and every step would report as ambiguous.
 */
export function runProviderTck(options: TckOptions): void {
  const declared = new Set<Capability>(options.capabilities ?? ALL_CAPABILITIES);
  const undeclared = ALL_CAPABILITIES.filter((capability) => !declared.has(capability));

  if (declared.has(Capability.UnavailableInit) && !options.newUnavailableProvider) {
    throw new Error(
      'capabilities declares Capability.UnavailableInit but newUnavailableProvider is not set: ' +
        'the @unavailable scenarios need a provider pointed at a backend that does not exist. ' +
        'Supply one, or remove the capability so those scenarios are skipped with a reason.',
    );
  }

  const state = new TckState(options);

  describe(`provider-tck [${options.name}]`, () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        `provider-tck [${options.name}]: backend under test is ${options.control.description}; ` +
          `declared capabilities ${[...declared].sort().join(' ') || '(none)'}`,
      );
    });

    beforeEach(async () => {
      state.reset();
      await options.control.prepareScenario();
    });

    afterEach(async () => {
      await OpenFeature.close();
    });

    afterAll(async () => {
      // Registering a provider in a domain closes the one it replaces, so every scenario but the
      // last cleans up after itself. Clearing the domain closes that gap, which matters for a
      // provider holding a network connection.
      await OpenFeature.clearProviders();
    });

    autoBindSteps(
      loadFeatures(FEATURES_GLOB, {
        // Undeclared capabilities are excluded here, which marks their scenarios
        // `skippedViaTagFilter`. jest-cucumber turns that into `test.skip`, so they are reported as
        // SKIPPED rather than quietly omitted -- which is the whole point. The reason travels in the
        // scenario name below, because Jest has nowhere else to put it.
        tagFilter: undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined,
        scenarioNameTemplate: ({ scenarioTitle, scenarioTags, featureTags }) => {
          const missing = [...scenarioTags, ...featureTags]
            .map(capabilityForTag)
            .filter((capability): capability is Capability => capability !== undefined)
            .filter((capability) => !declared.has(capability));

          return missing.length
            ? `${scenarioTitle} — SKIPPED: provider does not declare ${missing.join(' ')}`
            : scenarioTitle;
        },
      }),
      [providerSteps(state), flagSteps(state), eventSteps(state)],
    );
  });
}
