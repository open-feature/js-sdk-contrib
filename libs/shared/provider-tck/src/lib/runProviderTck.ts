import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { ALL_CAPABILITIES, Capability, capabilityForTag } from './capability';
import type { TckOptions } from './options';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';

/**
 * Locates a directory of packaged assets, resolved from this module rather than from the working
 * directory.
 *
 * The assets ship *inside* the library so that adopting the TCK never requires a git submodule or a
 * particular repository layout. That rules out a workspace-relative path: it would resolve against
 * whatever directory the test runner happened to start in, which is the workspace root here and
 * something else entirely for anyone consuming the published package.
 *
 * Two layouts have to work, so both are tried in order:
 *
 *   - `<pkg>/features` — the published package, where the rollup `assets` globs place them next to
 *     the bundle;
 *   - `<pkg>/../features` — this repository, where the entry point compiles from `src/lib` and the
 *     assets sit at the library root.
 */
function resolveAssetDir(name: string): string {
  const candidates = [
    join(__dirname, name),
    join(__dirname, '..', name),
    join(__dirname, '..', '..', name),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `provider-tck: could not locate its packaged '${name}' directory. ` +
        `Looked in: ${candidates.join(', ')}. ` +
        `The conformance assets ship inside this package; if they are missing, it was ` +
        `built without its asset globs.`,
    );
  }
  return found;
}

/** The glob matching the canonical feature files packaged with this library. */
export const FEATURES_GLOB = join(resolveAssetDir('features'), '*.feature');

/** The canonical flag set, as raw JSON, for a suite that seeds a backend from it. */
export const CANONICAL_FLAGS_PATH = join(resolveAssetDir('flags'), 'canonical-flags.json');

/** The OpenAPI document a containerised backend under test must implement. */
export const CONTROL_API_PATH = join(resolveAssetDir('openapi'), 'control-api.yaml');

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
