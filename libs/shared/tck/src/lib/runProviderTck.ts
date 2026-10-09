import { basename, join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { resolveAssetDir } from './assets';
import { expiredReservations, unknownCapabilityTags } from './capability';
import { featureFiles, resolveExtensionFeatures } from './extensions';
import type { TckOptions } from './options';
import { eventTimeout, readyTimeout, resolveCapabilities } from './options';
import { planScenarios, scenarioRunner } from './scenarioRunner';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';
import { registerSuiteUnderTest } from './underTest';

/** The glob matching the canonical feature files packaged with this library. */
export const FEATURES_GLOB = join(resolveAssetDir('features'), '*.feature');

/** One feature file: its bare name, jest-cucumber's parse, and where it came from. */
export interface TckFeature {
  feature: string;
  parsed: ReturnType<typeof loadFeature>;
  /**
   * Whether this file is part of the canonical conformance set; false for one an adopter supplied
   * through {@link TckOptions.extensionFeatures}. The distinction keeps an extension out of anything
   * that reads as a conformance claim.
   */
  canonical: boolean;
}

/**
 * The canonical feature files, loaded one at a time rather than through the glob.
 *
 * Per file, because a feature's bare name is what identifies the feature a scenario belongs to, and
 * `loadFeatures` does not say which file it parsed which feature from.
 */
export function loadTckFeatures(tagFilter: string | undefined): TckFeature[] {
  const dir = resolveAssetDir('features');

  return featureFiles(dir).map((path) => ({
    feature: basename(path, '.feature'),
    parsed: loadFeature(path, { tagFilter }),
    canonical: true,
  }));
}

/**
 * The feature files an adopter contributed, loaded the same way the canonical ones are.
 *
 * The same loader and the same tag filter, so an extension scenario is gated by the capability
 * declaration exactly as a canonical one is; only the `canonical` flag differs.
 * `resolveExtensionFeatures` refuses anything that could be mistaken for a canonical feature before
 * a line of it is parsed.
 */
export function loadExtensionFeatures(paths: readonly string[], tagFilter: string | undefined): TckFeature[] {
  if (!paths.length) {
    return [];
  }

  const canonicalDir = resolveAssetDir('features');
  const canonicalNames = new Set(featureFiles(canonicalDir).map((path) => basename(path, '.feature')));

  return resolveExtensionFeatures(paths, canonicalDir, canonicalNames).map(({ feature, path }) => ({
    feature,
    parsed: loadFeature(path, { tagFilter }),
    canonical: false,
  }));
}

/** Accepts an option that may be given once or several times, and always yields a list. */
function asList<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? (value as readonly T[]) : ([value] as readonly T[]);
}

/**
 * The canonical flag set as raw JSON, and the control-API document a containerised backend must
 * implement, re-exported from where they are resolved.
 *
 * One definition of each path is the point: the file an adopter seeds a backend from is provably the
 * same file {@link canonicalFlagSet} builds this library's in-memory configuration out of.
 */
export { CANONICAL_FLAGS_PATH, CONTROL_API_PATH } from './assets';

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
  const { declared, undeclared, knownDeviations } = resolveCapabilities(options);
  const state = new TckState(options);

  // Jest's 5s default is shorter than every bound this suite works to, and whichever cap fires first
  // wins: without this line the harness's own timeouts -- which name the thing that did not happen --
  // are unreachable. Measured: a deliberately broken `@unavailable` scenario bounding its error event
  // at 10000ms failed at 5001ms instead. Derived from the suite's own bounds because a scenario may
  // wait three times over and make two direct lifecycle calls on top of registration; it is a
  // backstop, never the thing that should fire.
  jest.setTimeout(3 * (eventTimeout(options) + readyTimeout(options)));

  // Before anything else observable happens, so a second call in the same file is refused with a
  // message rather than by jest-cucumber reporting every step as ambiguous.
  registerSuiteUnderTest(state);

  // Excluding an undeclared capability marks its scenarios `skippedViaTagFilter`, which
  // jest-cucumber turns into `test.skip`: reported as SKIPPED rather than quietly omitted, with the
  // reason in the scenario name because Jest has nowhere else to put it.
  const tagFilter = undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined;

  // The canonical set first and always, then whatever the adopter added, so no wiring mistake can
  // leave a canonical feature out.
  const features = [
    ...loadTckFeatures(tagFilter),
    ...loadExtensionFeatures(asList(options.extensionFeatures), tagFilter),
  ];

  // jest-cucumber accepts a runner to make its test/test.skip calls through, and that is the only
  // seam reaching a Scenario Outline's example rows -- `scenarioNameTemplate` does not.
  const plans = features.map(({ parsed }) => planScenarios(parsed, declared));

  // Checked against the features that actually ran, because which capabilities are reserved is
  // recorded here but decided upstream. Canonical only: an adopter's own feature reaching for a
  // reserved tag is a mistake in that file, not news about the specification.
  const canonicalTags = plans.flatMap((plan, position) =>
    features[position].canonical ? plan.flatMap((scenario) => scenario.tags) : [],
  );

  // The reservation check below from the other end: a canonical tag this vocabulary does not know
  // gates nothing, so its scenarios stay mandatory for every adopter -- see `unknownCapabilityTags`
  // for the measurement behind it.
  //
  // Raised here rather than only in this library's own tests, because the integrity checks have to be
  // in force *where the scenarios execute*: an adopter runs the canonical set from its own build, and
  // a guarantee that holds only in `nx test tck` does not cover that run.
  const unknown = unknownCapabilityTags(canonicalTags);
  if (unknown.length) {
    throw new Error(
      `tck [${options.name}]: the canonical feature files carry ${unknown.join(' ')}, which this ` +
        `library's Capability vocabulary does not know, so nothing gates those scenarios and they ` +
        `are mandatory for every adopter. Register the capability in Capability -- the assets have ` +
        `moved ahead of this library. Every tag in the canonical set is a capability tag, so an ` +
        `unrecognised one is never merely organisational.`,
    );
  }

  const expired = expiredReservations(canonicalTags);
  if (expired.length) {
    throw new Error(
      `tck [${options.name}]: ${expired.join(' ')} is reserved here, but the executed ` +
        `feature files now carry a scenario for it. Remove it from RESERVED_CAPABILITIES so ` +
        `adoptions can declare it, or those scenarios will be skipped for a capability nobody can ` +
        `claim.`,
    );
  }

  features.forEach(({ parsed }, position) => {
    parsed.options.runner = scenarioRunner(parsed.title, plans[position]);
  });

  const extensions = features.filter(({ canonical }) => !canonical).map(({ feature }) => feature);

  describe(`tck [${options.name}]`, () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        `tck [${options.name}]: backend under test is ${options.control.description}; ` +
          `declared capabilities ${[...declared].sort().join(' ') || '(none)'}` +
          // Named rather than counted, so a scenario a reader does not recognise can be traced to
          // the adopter rather than to the shared suite.
          (extensions.length ? `; extension features ${extensions.sort().join(' ')}` : '') +
          // Printed in full, next to the declaration it qualifies: a deviation exists to be read
          // alongside the failure, and the run's output is where that is read first.
          knownDeviations
            .map(
              (deviation) =>
                `\ntck [${options.name}]: known deviation` +
                (deviation.capability ? ` in ${deviation.capability}` : '') +
                ` -- ${deviation.summary}` +
                (deviation.issue ? ` (${deviation.issue})` : ' (not tracked upstream)'),
            )
            .join(''),
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
      // Registering a provider closes the one it replaces, so only the last scenario's is left
      // open; clearing the domain matters for a provider holding a network connection.
      await OpenFeature.clearProviders();
    });

    // One call, so canonical and extension steps are interchangeable. jest-cucumber rejects a step
    // text two definitions match, so an extension cannot quietly redefine a canonical step.
    autoBindSteps(
      features.map(({ parsed }) => parsed),
      [providerSteps(state), flagSteps(state), eventSteps(state), ...asList<StepDefinitions>(options.extensionSteps)],
    );
  });
}
