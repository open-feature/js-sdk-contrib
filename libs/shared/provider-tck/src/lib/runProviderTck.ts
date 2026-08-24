import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { ALL_CAPABILITIES, Capability } from './capability';
import type { TckOptions } from './options';
import { planScenarios, scenarioRunner } from './scenarioRunner';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';

/** Where the conformance assets live inside a checkout of open-feature/spec. */
const SPEC_ASSET_ROOT = join('spec', 'specification', 'assets', 'provider-tck');

/**
 * The directory each packaged asset directory is built from inside the spec submodule.
 *
 * Only `features` is renamed: the spec calls that directory `gherkin`, and the published package
 * keeps the name the API talks about.
 */
const SPEC_SUBDIR: Record<string, string> = {
  features: 'gherkin',
  flags: 'flags',
  openapi: 'openapi',
};

/**
 * Locates a directory of conformance assets, resolved from this module rather than from the working
 * directory.
 *
 * That rules out a workspace-relative path: it would resolve against whatever directory the test
 * runner happened to start in, which is the workspace root here and something else entirely for
 * anyone consuming the published package.
 *
 * Two layouts have to work, so both are tried in order:
 *
 *   - `<pkg>/features` — the published package. The assets ship *inside* the library, so **adopting
 *     the TCK never requires a git submodule**; the rollup `assets` globs copy them out of the
 *     submodule and place them next to the bundle at package time;
 *   - `<lib>/spec/specification/assets/provider-tck/gherkin` — this repository, where the assets are
 *     not vendored at all but read straight out of the `open-feature/spec` submodule. They are
 *     owned there, and a copy in this repository would be a second place for conformance to drift.
 */
function resolveAssetDir(name: string): string {
  const fromSpec = join(SPEC_ASSET_ROOT, SPEC_SUBDIR[name] ?? name);
  const candidates = [
    // The published package, whose entry point sits at the package root or one level below it.
    join(__dirname, name),
    join(__dirname, '..', name),
    join(__dirname, '..', '..', name),
    // This repository, where the entry point compiles from `src/lib` under the library root.
    join(__dirname, '..', '..', fromSpec),
    join(__dirname, '..', fromSpec),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `provider-tck: could not locate its '${name}' directory. ` +
        `Looked in: ${candidates.join(', ')}. ` +
        `Consuming the published package needs no submodule -- the assets ship inside it, so if ` +
        `they are missing it was built without its asset globs. Working in js-sdk-contrib needs ` +
        `the spec submodule: run 'git submodule update --init libs/shared/provider-tck/spec'.`,
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

  // Undeclared capabilities are excluded here, which marks their scenarios `skippedViaTagFilter`.
  // jest-cucumber turns that into `test.skip`, so they are reported as SKIPPED rather than quietly
  // omitted -- which is the whole point. The reason travels in the scenario name, because Jest has
  // nowhere else to put it.
  const tagFilter = undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined;

  // jest-cucumber owns the test and test.skip calls and accepts a runner to make them through, so
  // the harness supplies one per feature. That is the only seam that reaches a Scenario Outline's
  // example rows: `scenarioNameTemplate` never does.
  const features = loadFeatures(FEATURES_GLOB, { tagFilter });
  for (const parsed of features) {
    parsed.options.runner = scenarioRunner(parsed.title, planScenarios(parsed, declared));
  }

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

    autoBindSteps(features, [providerSteps(state), flagSteps(state), eventSteps(state)]);
  });
}
