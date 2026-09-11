import { basename, join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { resolveAssetDir } from './assets';
import { expiredReservations } from './capability';
import { featureFileNames, resolveExtensionFeatures } from './extensions';
import type { TckOptions } from './options';
import { resolveCapabilities } from './options';
import { planScenarios, scenarioRunner } from './scenarioRunner';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';

/** The glob matching the canonical feature files packaged with this library. */
export const FEATURES_GLOB = join(resolveAssetDir('features'), '*.feature');

/** One feature file: its bare name, jest-cucumber's parse, and where it came from. */
export interface TckFeature {
  feature: string;
  parsed: ReturnType<typeof loadFeature>;
  /**
   * Whether this file is part of the canonical conformance set.
   *
   * False for a feature an adopter supplied through {@link TckOptions.extensionFeatures}. The
   * distinction is what keeps an extension out of anything that reads as a conformance claim.
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

  return featureFileNames(dir).map((entry) => ({
    feature: basename(entry, '.feature'),
    parsed: loadFeature(join(dir, entry), { tagFilter }),
    canonical: true,
  }));
}

/**
 * The feature files an adopter contributed, loaded the same way the canonical ones are.
 *
 * The same loader and the same tag filter, so an extension scenario is gated by the capability
 * declaration exactly as a canonical one is. What differs is the `canonical` flag, which is how
 * anything downstream tells an adopter's scenario from one the shared suite owns.
 *
 * `resolveExtensionFeatures` refuses anything that could be mistaken for a canonical feature before
 * a line of it is parsed.
 */
export function loadExtensionFeatures(paths: readonly string[], tagFilter: string | undefined): TckFeature[] {
  if (!paths.length) {
    return [];
  }

  const canonicalDir = resolveAssetDir('features');
  const canonicalNames = new Set(featureFileNames(canonicalDir).map((entry) => basename(entry, '.feature')));

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
 * Both are part of this module's published surface and both are now defined in `assets`, which is
 * also where {@link canonicalFlagSet} reads the flag file from. One definition of each path is the
 * point: the file an adopter seeds a backend from is provably the same file this library builds
 * its own in-memory flag configuration out of.
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
  const { declared, notApplicable, undeclared, knownDeviations } = resolveCapabilities(options);
  const state = new TckState(options);

  // Undeclared capabilities are excluded here, which marks their scenarios `skippedViaTagFilter`.
  // jest-cucumber turns that into `test.skip`, so they are reported as SKIPPED rather than quietly
  // omitted -- which is the whole point. The reason travels in the scenario name, because Jest has
  // nowhere else to put it.
  const tagFilter = undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined;

  // The canonical set first and always, then whatever the adopter added. Extensions extend the run;
  // they never take part in producing it, so no wiring mistake can leave a canonical feature out.
  const features = [
    ...loadTckFeatures(tagFilter),
    ...loadExtensionFeatures(asList(options.extensionFeatures), tagFilter),
  ];

  // jest-cucumber owns the test and test.skip calls and accepts a runner to make them through, so
  // the harness supplies one per feature. That is the only seam that reaches a Scenario Outline's
  // example rows: `scenarioNameTemplate` never does.
  const plans = features.map(({ parsed }) => planScenarios(parsed, declared));

  // Which capabilities are reserved is recorded here but decided upstream, so it is checked against
  // the features that actually ran rather than trusted. A reservation whose scenario has since been
  // written would otherwise go on making a testable capability undeclarable -- the opposite mistake,
  // and just as quiet. Only the canonical set can expire a reservation: an adopter's own feature
  // reaching for a reserved tag is a mistake in that file, not news about the specification.
  const expired = expiredReservations(
    plans.flatMap((plan, position) => (features[position].canonical ? plan.flatMap((scenario) => scenario.tags) : [])),
  );
  if (expired.length) {
    throw new Error(
      `provider-tck [${options.name}]: ${expired.join(' ')} is reserved here, but the executed ` +
        `feature files now carry a scenario for it. Remove it from RESERVED_CAPABILITIES so ` +
        `adoptions can declare it, or those scenarios will be skipped for a capability nobody can ` +
        `claim.`,
    );
  }

  features.forEach(({ parsed }, position) => {
    parsed.options.runner = scenarioRunner(parsed.title, plans[position], notApplicable);
  });

  const extensions = features.filter(({ canonical }) => !canonical).map(({ feature }) => feature);

  describe(`provider-tck [${options.name}]`, () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        `provider-tck [${options.name}]: backend under test is ${options.control.description}; ` +
          `declared capabilities ${[...declared].sort().join(' ') || '(none)'}` +
          (notApplicable.size ? `; not applicable ${[...notApplicable.keys()].sort().join(' ')}` : '') +
          // Named rather than counted: a reader of the output has to be able to see that a scenario
          // they do not recognise came from the adopter and not from the shared suite.
          (extensions.length ? `; extension features ${extensions.sort().join(' ')}` : '') +
          // Printed in full, next to the declaration it qualifies. A deviation exists to be read
          // alongside a failure, and a run's output is where someone reads that failure first.
          knownDeviations
            .map(
              (deviation) =>
                `\nprovider-tck [${options.name}]: known deviation` +
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
      // Registering a provider in a domain closes the one it replaces, so every scenario but the
      // last cleans up after itself. Clearing the domain closes that gap, which matters for a
      // provider holding a network connection.
      await OpenFeature.clearProviders();
    });

    // One call, so an extension scenario draws on the canonical vocabulary and an extension step is
    // usable from a canonical one. jest-cucumber rejects a step text that two definitions match, so
    // an extension step cannot quietly redefine a canonical one.
    autoBindSteps(
      features.map(({ parsed }) => parsed),
      [providerSteps(state), flagSteps(state), eventSteps(state), ...asList<StepDefinitions>(options.extensionSteps)],
    );
  });
}
