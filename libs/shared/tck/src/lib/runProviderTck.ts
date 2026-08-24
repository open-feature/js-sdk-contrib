import { basename, join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { resolveAssetDir } from './assets';
import { expiredReservations } from './capability';
import { featureFiles, resolveExtensionFeatures } from './extensions';
import type { TckOptions } from './options';
import { eventTimeout, readyTimeout, resolveCapabilities } from './options';
import { ConformanceRecorder, coverageProblems, writeConformanceReport } from './report';
import type { FeaturePlan } from './scenarioRunner';
import { planFeature, scenarioRunner } from './scenarioRunner';
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
  const { declared, undeclared, knownDeviations } = resolveCapabilities(options);
  const state = new TckState(options);

  // Jest's own per-test timeout is 5s by default, and every bound this suite works to is longer than
  // that: `eventTimeoutMs` defaults to 12s, `readyTimeoutMs` to 30s, and `lifecycle.feature` bounds
  // an error event at 10s. Whichever cap fires first wins, so until this line the harness's own
  // timeouts -- which exist to fail with a message naming the thing that did not happen -- were
  // unreachable, and a provider slower than five seconds was reported as "Exceeded timeout of
  // 5000 ms for a test". Measured rather than reasoned about: a deliberately broken `@unavailable`
  // scenario, whose step bounds the error event at 10000ms, failed at 5001ms.
  //
  // Derived from the suite's own bounds rather than picked: a scenario may wait three times over --
  // the stale one awaits ready, stale and ready again -- and may make two direct lifecycle calls on
  // top of registration, each bounded by `readyTimeoutMs`. This is a backstop above all of that,
  // never the thing that should fire.
  jest.setTimeout(3 * (eventTimeout(options) + readyTimeout(options)));

  // Before anything else observable happens, so an extension step bound below has a suite to read
  // and a second call in the same file is refused with a message rather than by jest-cucumber
  // reporting every step as ambiguous.
  registerSuiteUnderTest(state);

  const recorder = new ConformanceRecorder({
    suiteName: options.name,
    control: options.control,
    declared,
    notApplicable: new Set(notApplicable.keys()),
    observedProviderName: () => state.providerName,
  });

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

  const plans: FeaturePlan[] = features.map(({ feature, parsed }) => planFeature(feature, parsed, declared));

  // Which capabilities are reserved is recorded here but decided upstream, so it is checked against
  // the features that actually ran rather than trusted. A reservation whose scenario has since been
  // written would otherwise go on making a testable capability undeclarable -- the opposite mistake,
  // and just as quiet. Only the canonical set can expire a reservation: an adopter's own feature
  // reaching for a reserved tag is a mistake in that file, not news about the specification.
  const expired = expiredReservations(
    plans.flatMap((plan, position) =>
      features[position].canonical ? plan.scenarios.flatMap((scenario) => scenario.tags) : [],
    ),
  );
  if (expired.length) {
    throw new Error(
      `tck [${options.name}]: ${expired.join(' ')} is reserved here, but the executed ` +
        `feature files now carry a scenario for it. Remove it from RESERVED_CAPABILITIES so ` +
        `adoptions can declare it, or those scenarios will be skipped for a capability nobody can ` +
        `claim.`,
    );
  }

  // jest-cucumber owns the test and test.skip calls, and accepts a runner to make them through, so
  // the harness supplies one per feature. Recording the outcome there means it is captured where the
  // decision is made rather than scraped back out of a reporter afterwards, and it is the only seam
  // that reaches a Scenario Outline's example rows.
  features.forEach(({ parsed }, position) => {
    parsed.options.runner = scenarioRunner(plans[position], recorder);
  });

  const extensions = features.filter(({ canonical }) => !canonical).map(({ feature }) => feature);

  describe(`tck [${options.name}]`, () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        `tck [${options.name}]: backend under test is ${options.control.description}; ` +
          `declared capabilities ${[...declared].sort().join(' ') || '(none)'}` +
          // Named rather than counted: a reader of the output has to be able to see that a scenario
          // they do not recognise came from the adopter and not from the shared suite.
          (extensions.length ? `; extension features ${extensions.sort().join(' ')}` : '') +
          // Printed in full, next to the declaration it qualifies. A deviation exists to be read
          // alongside a failure, and a run's output is where someone reads that failure first.
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

    afterAll(() => {
      // Appendix F's rule is that a scenario skipped for an undeclared capability is reported as
      // skipped and never as passed. That is only checkable if the report accounts for every
      // scenario, so the accounting is verified here rather than assumed -- in every run, not only
      // when a report is being written.
      const planned = plans.flatMap((plan) =>
        plan.scenarios.map(({ title }) => ({ feature: plan.feature, name: title })),
      );
      const problems = coverageProblems(recorder.results, planned);
      if (problems.length) {
        throw new Error(
          `tck [${options.name}]: the conformance report does not account for every ` +
            `scenario exactly once, so it cannot be trusted:\n  ${problems.join('\n  ')}`,
        );
      }

      const path = writeConformanceReport(recorder, options.name);
      if (path) {
        // eslint-disable-next-line no-console
        console.log(`tck [${options.name}]: conformance report written to ${path}`);
      }
    });
  });
}
