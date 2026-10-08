import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import { IdGenerator } from '@cucumber/messages';
import { OpenFeature } from '@openfeature/server-sdk';
import { resolveAssetDir } from './assets';
import { expiredReservations, unknownCapabilityTags } from './capability';
import { EXTENSION_URI_PREFIX, featureFiles, resolveExtensionFeatures } from './extensions';
import type { FeatureMessages } from './messages';
import { ConformanceMessages, readFeatureMessages } from './messages';
import type { TckOptions } from './options';
import { eventTimeout, readyTimeout, resolveCapabilities } from './options';
import type { ScenarioIdentity } from './report';
import { ConformanceRecorder, coverageProblems, unexecutedScenarios, writeConformanceReport } from './report';
import { SPEC_REVISION } from './revision';
import type { FeaturePlan } from './scenarioRunner';
import { planFeature, scenarioRunner } from './scenarioRunner';
import { TckState } from './state';
import { eventSteps } from './steps/eventSteps';
import { flagSteps } from './steps/flagSteps';
import { providerSteps } from './steps/providerSteps';
import { registerSuiteUnderTest } from './underTest';

/** The glob matching the canonical feature files packaged with this library. */
export const FEATURES_GLOB = join(resolveAssetDir('features'), '*.feature');

/**
 * The directory component a canonical feature's URI carries, which is the spec's name for it.
 *
 * The same string as `SPEC_SUBDIR.features`, and deliberately not read from it: that map says where
 * to *find* the files in a submodule checkout, this says what the canonical URI *is*. They only
 * happen to coincide. The published package renames the directory to `features`, and the URI must
 * not follow it -- a report from a packaged run and one from a submodule run have to name the same
 * feature identically.
 */
const CANONICAL_URI_DIR = 'gherkin';

/**
 * The URI a feature file is named by in the results stream.
 *
 * **The path relative to the spec's asset directory** -- `gherkin/errors.feature` -- not the path
 * relative to a repository root and not the path the file happens to sit at on this machine. With
 * `tck.specRevision` from the envelope that names the executed artifact exactly, and it is the same
 * string wherever the suite runs.
 *
 * Appendix F states the form, and it states it because a phrasing that merely implied it produced
 * three different answers across four TCK implementations -- this one emitted the repository-relative
 * path, which is the reading that made the rule's defect visible. The directory is the unit because
 * those assets are also a released Go module whose root *is* that directory: its embed keys are
 * `gherkin/*.feature`, and nothing inside it knows or should know where it sits in a checkout.
 * Anything longer forces every consumer to hardcode a constant describing a checkout it does not
 * have, and a consumer joining two languages' results keys on this URI and the scenario name -- so
 * the form is what makes the join work at all.
 *
 * Assembled with forward slashes, because a URI is not a filesystem path and a Windows separator
 * here would make two runs of identical assets report different sources.
 *
 * @see https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
 */
function featureUri(feature: string): string {
  return `${CANONICAL_URI_DIR}/${feature}.feature`;
}

/** One feature file: its bare name, jest-cucumber's parse, its Cucumber Messages, and where it came from. */
export interface TckFeature {
  feature: string;
  parsed: ReturnType<typeof loadFeature>;
  messages: FeatureMessages;
  /**
   * Whether this file is part of the canonical conformance set; false for one an adopter supplied
   * through {@link TckOptions.extensionFeatures}. The distinction keeps an extension out of anything
   * that reads as a conformance claim.
   */
  canonical: boolean;
}

/** Reads one feature file both ways: jest-cucumber's parse, and the Gherkin compiler's messages. */
function readFeature(
  path: string,
  feature: string,
  uri: string,
  canonical: boolean,
  tagFilter: string | undefined,
  nextId: IdGenerator.NewId,
): TckFeature {
  return {
    feature,
    canonical,
    parsed: loadFeature(path, { tagFilter }),
    messages: readFeatureMessages(uri, readFileSync(path, 'utf8'), nextId),
  };
}

/**
 * The canonical feature files, loaded one at a time rather than through the glob.
 *
 * Per file, because a feature's bare name is what identifies the feature a scenario belongs to, and
 * `loadFeatures` does not say which file it parsed which feature from. Reading the directory itself
 * also gives the source each file's `Source`, `GherkinDocument` and `Pickle` messages are compiled
 * from -- which jest-cucumber discards during expansion.
 */
export function loadTckFeatures(tagFilter: string | undefined, newId?: IdGenerator.NewId): TckFeature[] {
  const dir = resolveAssetDir('features');
  // Ids have to be unique across the features of one stream, so the generator is shared between
  // them. A caller with no stream to add them to gets a private one.
  const nextId = newId ?? IdGenerator.incrementing();

  return featureFiles(dir).map((path) => {
    const feature = basename(path, '.feature');
    return readFeature(path, feature, featureUri(feature), true, tagFilter, nextId);
  });
}

/**
 * The feature files an adopter contributed, loaded the same way the canonical ones are.
 *
 * The same loader and the same tag filter, so an extension scenario is gated by the capability
 * declaration exactly as a canonical one is; only the `canonical` flag differs.
 * `resolveExtensionFeatures` refuses anything that could be mistaken for a canonical feature before
 * a line of it is parsed.
 */
export function loadExtensionFeatures(
  paths: readonly string[],
  tagFilter: string | undefined,
  newId?: IdGenerator.NewId,
): TckFeature[] {
  if (!paths.length) {
    return [];
  }

  const canonicalDir = resolveAssetDir('features');
  const canonicalNames = new Set(featureFiles(canonicalDir).map((path) => basename(path, '.feature')));
  const nextId = newId ?? IdGenerator.incrementing();

  return resolveExtensionFeatures(paths, canonicalDir, canonicalNames).map(({ feature, path }) =>
    readFeature(path, feature, `${EXTENSION_URI_PREFIX}/${feature}.feature`, false, tagFilter, nextId),
  );
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

  // The canonical set first and always, then whatever the adopter added, so no wiring mistake can
  // leave a canonical feature out.
  const tagFilter = undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined;
  const messages = new ConformanceMessages();
  const features = [
    ...loadTckFeatures(tagFilter, messages.newId),
    ...loadExtensionFeatures(asList(options.extensionFeatures), tagFilter, messages.newId),
  ];
  features.forEach((feature) => messages.addFeature(feature.messages));

  // jest-cucumber accepts a runner to make its test/test.skip calls through, and that is the only
  // seam reaching a Scenario Outline's example rows -- `scenarioNameTemplate` does not.
  const plans: FeaturePlan[] = features.map(({ feature, parsed, messages: compiled }) =>
    planFeature(feature, parsed, compiled.planned, declared),
  );

  // Checked against the features that actually ran, because which capabilities are reserved is
  // recorded here but decided upstream. Canonical only: an adopter's own feature reaching for a
  // reserved tag is a mistake in that file, not news about the specification.
  const canonicalTags = plans.flatMap((plan, position) =>
    features[position].canonical ? plan.scenarios.flatMap((scenario) => scenario.tags) : [],
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

  const recorder = new ConformanceRecorder({
    suiteName: options.name,
    control: options.control,
    declared,
    knownDeviations,
    messages,
    observedProviderName: () => state.providerName,
  });

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

    afterAll(() => {
      // Appendix F's rule is that a scenario skipped for an undeclared capability is reported as
      // skipped and never as passed. That is only checkable if the report accounts for every
      // scenario, so the accounting is verified here rather than assumed -- in every run, not only
      // when a report is being written.
      const plannedIn = (wanted: boolean): ScenarioIdentity[] =>
        plans.flatMap((plan, position) =>
          features[position].canonical === wanted
            ? plan.scenarios.map(({ name, pickleId, example }) => ({ feature: plan.feature, name, pickleId, example }))
            : [],
        );

      const canonicalPlanned = plannedIn(true);
      const problems = coverageProblems(recorder.results, [...canonicalPlanned, ...plannedIn(false)]);
      if (problems.length) {
        throw new Error(
          `tck [${options.name}]: the conformance report does not account for every ` +
            `scenario exactly once, so it cannot be trusted:\n  ${problems.join('\n  ')}`,
        );
      }

      // The accounting above proves the report has an entry for every scenario. It does not prove
      // the run produced those entries: a scenario is registered when it is defined, so one Jest
      // then declined to run carries a placeholder failure and satisfies the accounting anyway. A
      // partial run therefore goes green today -- a `-t` filter, a `testPathIgnorePatterns` entry,
      // or a mistake in the extension wiring -- while its report claims nothing it can support.
      //
      // The canonical set is the entire content of a conformance claim, so it is checked. Extension
      // scenarios are excluded: they are the adopter's, and filtering them is the adopter's business.
      const unexecuted = unexecutedScenarios(canonicalPlanned, recorder.settled);
      if (unexecuted.length) {
        throw new Error(
          `tck [${options.name}]: ${unexecuted.length} of ${canonicalPlanned.length} ` +
            `canonical scenarios did not run, so this run cannot support a conformance claim and ` +
            `its report must not be published. The canonical set is the one in open-feature/spec ` +
            `at ${SPEC_REVISION || 'an unknown revision'}; it is fixed, and running less of it is ` +
            `not a configuration. If you filtered deliberately -- 'jest -t' while working on a ` +
            `single scenario -- this failure is the expected consequence.\n  ${unexecuted.join('\n  ')}`,
        );
      }

      const written = writeConformanceReport(recorder, options.name);
      if (written) {
        const counts = Object.entries(recorder.statusCounts)
          .sort()
          .map(([status, count]) => `${status} ${count}`)
          .join(', ');

        // eslint-disable-next-line no-console
        console.log(
          `tck [${options.name}]: conformance report written to ${written.report}, ` +
            `results to ${written.results} (${counts})`,
        );
      }
    });
  });
}
