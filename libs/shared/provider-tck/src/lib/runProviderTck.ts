import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import { IdGenerator } from '@cucumber/messages';
import { OpenFeature } from '@openfeature/server-sdk';
import { ALL_CAPABILITIES, Capability } from './capability';
import type { FeatureMessages } from './messages';
import { ConformanceMessages, readFeatureMessages } from './messages';
import type { TckOptions } from './options';
import { ConformanceRecorder, coverageProblems, writeConformanceReport } from './report';
import type { FeaturePlan } from './scenarioRunner';
import { planFeature, scenarioRunner } from './scenarioRunner';
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

/**
 * The URI a feature file is named by in the results stream.
 *
 * The path the artifacts have upstream, not the path they happen to sit at on this machine: with
 * `tck.specRevision` from the envelope it names the executed file exactly, and it is the same
 * string wherever the suite runs. Assembled with forward slashes for the same reason -- a URI is
 * not a filesystem path, and a Windows separator here would make two runs of identical assets
 * report different sources.
 */
function featureUri(feature: string): string {
  return `specification/assets/provider-tck/gherkin/${feature}.feature`;
}

/** One canonical feature file: its bare name, jest-cucumber's parse, and its Cucumber Messages. */
export interface TckFeature {
  feature: string;
  parsed: ReturnType<typeof loadFeature>;
  messages: FeatureMessages;
}

/**
 * The canonical feature files, in a fixed order, each paired with its bare name and its messages.
 *
 * jest-cucumber's `loadFeatures` globs internally and returns parsed features with no indication of
 * which file each came from, in whatever order the glob produced. Both matter here: the conformance
 * report records the feature a scenario belongs to as its file name, and a stable order makes two
 * runs comparable. Reading the directory directly gives both, and gives the source each file's
 * `Source`, `GherkinDocument` and `Pickle` messages are compiled from -- which jest-cucumber
 * discards during expansion.
 */
export function loadTckFeatures(tagFilter: string | undefined, newId?: IdGenerator.NewId): TckFeature[] {
  const dir = resolveAssetDir('features');
  // Ids have to be unique across the features of one stream, so the generator is shared between
  // them. A caller with no stream to add them to gets a private one.
  const nextId = newId ?? IdGenerator.incrementing();

  return readdirSync(dir)
    .filter((entry) => extname(entry) === '.feature')
    .sort()
    .map((entry) => {
      const feature = basename(entry, '.feature');

      return {
        feature,
        parsed: loadFeature(join(dir, entry), { tagFilter }),
        messages: readFeatureMessages(featureUri(feature), readFileSync(join(dir, entry), 'utf8'), nextId),
      };
    });
}

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
  const notApplicable = new Map<Capability, string>(
    Object.entries(options.notApplicable ?? {}).flatMap(([tag, reason]) =>
      reason ? [[tag as Capability, reason]] : [],
    ),
  );
  // Defaulting to everything *except* the inapplicable ones is the only reading that makes the two
  // fields composable: a suite that names only what cannot apply should not have to restate the
  // whole capability set to say so.
  const declared = new Set<Capability>(
    options.capabilities ?? ALL_CAPABILITIES.filter((capability) => !notApplicable.has(capability)),
  );
  const undeclared = ALL_CAPABILITIES.filter((capability) => !declared.has(capability));

  const contradictory = [...declared].filter((capability) => notApplicable.has(capability));
  if (contradictory.length) {
    throw new Error(
      `capabilities and notApplicable both list ${contradictory.join(' ')}. A capability is either ` +
        `something this provider supports or something it cannot be asked about, and the ` +
        `conformance report has to say which.`,
    );
  }

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
  // nowhere else to put it, and in the results stream on the skipped step's result.
  const tagFilter = undeclared.length ? undeclared.map((capability) => `not ${capability}`).join(' and ') : undefined;

  // Every scenario in the suite reaches the stream, including the ones the gate will skip: the tag
  // filter changes what runs, not what is compiled.
  const messages = new ConformanceMessages();
  const features = loadTckFeatures(tagFilter, messages.newId);
  features.forEach((feature) => messages.addFeature(feature.messages));

  const plans: FeaturePlan[] = features.map(({ feature, parsed, messages: compiled }) =>
    planFeature(feature, parsed, compiled.planned, declared),
  );

  const recorder = new ConformanceRecorder({
    suiteName: options.name,
    control: options.control,
    declared,
    notApplicable,
    messages,
    observedProviderName: () => state.providerName,
  });

  // jest-cucumber owns the test and test.skip calls, and accepts a runner to make them through, so
  // the harness supplies one per feature. Recording the outcome there means it is captured where the
  // decision is made rather than scraped back out of a reporter afterwards, and it is the only seam
  // that reaches a Scenario Outline's example rows.
  features.forEach(({ parsed }, position) => {
    parsed.options.runner = scenarioRunner(plans[position], recorder, notApplicable);
  });

  describe(`provider-tck [${options.name}]`, () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(
        `provider-tck [${options.name}]: backend under test is ${options.control.description}; ` +
          `declared capabilities ${[...declared].sort().join(' ') || '(none)'}` +
          (notApplicable.size ? `; not applicable ${[...notApplicable.keys()].sort().join(' ')}` : ''),
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
      features.map(({ parsed }) => parsed),
      [providerSteps(state), flagSteps(state), eventSteps(state)],
    );

    afterAll(() => {
      // Appendix F's rule is that a scenario skipped for an undeclared capability is reported as
      // skipped and never as passed. That is only checkable if the report accounts for every
      // scenario, so the accounting is verified here rather than assumed -- in every run, not only
      // when a report is being written.
      const planned = plans.flatMap((plan) =>
        plan.scenarios.map(({ name, pickleId, example }) => ({ feature: plan.feature, name, pickleId, example })),
      );
      const problems = coverageProblems(recorder.results, planned);
      if (problems.length) {
        throw new Error(
          `provider-tck [${options.name}]: the conformance report does not account for every ` +
            `scenario exactly once, so it cannot be trusted:\n  ${problems.join('\n  ')}`,
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
          `provider-tck [${options.name}]: conformance report written to ${written.report}, ` +
            `results to ${written.results} (${counts})`,
        );
      }
    });
  });
}
