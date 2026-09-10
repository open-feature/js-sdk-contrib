import type { IJestLike, loadFeature } from 'jest-cucumber';
import type { Capability } from './capability';
import { capabilityForTag } from './capability';
import type { PickledScenario } from './messages';
import type { ConformanceRecorder, ScenarioIdentity } from './report';

/** What `loadFeature` hands back. jest-cucumber does not export the type, so it is derived. */
type ParsedFeature = ReturnType<typeof loadFeature>;
type ParsedScenario = ParsedFeature['scenarios'][number];

/** One scenario, as the harness expects jest-cucumber to define it. */
export interface PlannedScenario {
  /**
   * The scenario name as the feature file writes it. Every row of a Scenario Outline shares it, and
   * an outline's placeholders are left unsubstituted.
   *
   * This is what the report records, and it is deliberately not {@link title}: the expanded title is
   * jest-cucumber's, and Go's and Python's runners produce different strings for the same row.
   */
  name: string;
  /** The title jest-cucumber defines the scenario under; an outline example carries its expanded title. */
  title: string;
  /**
   * The pickle this scenario is, in the emitted Messages stream.
   *
   * This is what identifies the scenario. Nothing else does: eleven rows of `errors.feature`'s
   * type-mismatch matrix share a name, and share their expanded title too, because the outline's
   * title has no placeholders in it.
   */
  pickleId: string;
  /**
   * The Examples row this scenario came from, keyed by column header, or absent for a scenario that
   * is not an outline example.
   *
   * Carried so a diagnostic can name a row the way the feature file writes it. It is not reported:
   * the stream identifies the row by the `TableRow` its pickle points at.
   */
  example?: Record<string, string>;
  /** Scenario tags and feature tags together, which is what gates the scenario. */
  tags: string[];
  /**
   * The capabilities gating this scenario that the provider does not have.
   *
   * Empty means the scenario must run. Non-empty means it must be skipped, and the harness asserts
   * both directions rather than trusting them.
   */
  missing: Capability[];
}

/** One feature file, and the scenarios jest-cucumber will define from it, in order. */
export interface FeaturePlan {
  /** The feature file's basename without extension: `errors`. */
  feature: string;
  /** The `Feature:` title, which is what jest-cucumber names the `describe` block. */
  title: string;
  scenarios: PlannedScenario[];
}

/**
 * Works out, ahead of the run, exactly which scenarios jest-cucumber will define from a feature and
 * which of them the capability gate will skip.
 *
 * Knowing this in advance is what lets the report be complete and self-checking, and it is what
 * lets a skipped scenario be named with its reason: jest-cucumber hands the runner nothing but a
 * title.
 *
 * The plan is positional, not keyed on the scenario name. Every row of a Scenario Outline shares one
 * name, and Gherkin permits tags on an individual `Examples` block, so two rows of one outline can
 * differ in whether the gate stops them — a name-keyed plan would gate all of them together. The
 * order follows the order `autoBindSteps` defines scenarios in: every plain scenario in file order,
 * then every example of every outline. The runner asserts the title it is handed against the plan at
 * each step, so a change in jest-cucumber's behaviour surfaces as a loud failure rather than a wrong
 * report.
 *
 * `compiled` is the same file's scenarios as the Gherkin compiler produced them, in that same
 * order, and each planned scenario is bound to one of them. That binding is what puts an outcome on
 * the right pickle in the results stream, so it is checked rather than assumed: jest-cucumber
 * substitutes an outline row into the scenario title and so does the pickle compiler, and the two
 * strings have to agree.
 */
export function planFeature(
  feature: string,
  parsed: ParsedFeature,
  compiled: readonly PickledScenario[],
  declared: ReadonlySet<Capability>,
): FeaturePlan {
  const defined: { scenario: ParsedScenario; name: string }[] = [
    ...parsed.scenarios.map((scenario) => ({ scenario, name: scenario.title })),
    // An outline's rows are named by the outline, placeholders and all. The expanded title is
    // jest-cucumber's string, and Go's and Python's runners produce different ones for the same row.
    ...parsed.scenarioOutlines.flatMap((outline) =>
      outline.scenarios.map((scenario) => ({ scenario, name: outline.title })),
    ),
  ];

  if (defined.length !== compiled.length) {
    throw new Error(
      `provider-tck: ${feature}.feature: jest-cucumber defines ${defined.length} scenarios but the ` +
        `Gherkin compiler produced ${compiled.length}. The report identifies a scenario by its ` +
        `pickle, so it cannot be built when the two disagree.`,
    );
  }

  const scenarios = defined.map(({ scenario, name }, position) => {
    const { pickle, example } = compiled[position];
    if (pickle.name !== scenario.title) {
      throw new Error(
        `provider-tck: ${feature}.feature: jest-cucumber's scenario ${position} is ` +
          `"${scenario.title}" but the pickle at that position is "${pickle.name}". Pairing them ` +
          `positionally is only sound while both derive from the same parse of the same file, and a ` +
          `wrong pairing would report an outcome against a scenario that did not run.`,
      );
    }

    const tags = Array.from(new Set([...scenario.tags, ...parsed.tags]));
    const missing: Capability[] = [];

    for (const tag of tags) {
      const capability = capabilityForTag(tag);
      // A tag that gates nothing is ignored, which is what lets the canonical feature files carry
      // organisational tags freely.
      if (capability && !declared.has(capability)) {
        missing.push(capability);
      }
    }

    return {
      name,
      title: scenario.title,
      pickleId: pickle.id,
      ...(example ? { example } : {}),
      tags,
      missing,
    };
  });

  return { feature, title: parsed.title, scenarios };
}

/** A Jest `describe` body, typed as jest-cucumber's `TestGroup` expects. */
type FeatureBody = (...args: unknown[]) => void;

/** A Jest test body, typed as jest-cucumber's `FrameworkTestCall` expects. */
type ScenarioAction = (...args: unknown[]) => void | Promise<void> | undefined;

/**
 * Builds the `describe`/`test` pair jest-cucumber calls for one feature, wrapped so every scenario's
 * outcome is recorded at the moment the harness decides it, and so a skipped one is named with the
 * reason it was skipped.
 *
 * jest-cucumber owns the `test` and `test.skip` calls, and it accepts a runner to make them
 * through. That is a better seam than a Jest reporter: the outcome is recorded where the decision is
 * made rather than reconstructed from output afterwards, and a scenario is registered when it is
 * *defined*, so one Jest never gets round to running still appears in the report. It is also the
 * only seam that reaches a Scenario Outline's example rows, which `scenarioNameTemplate` does not.
 */
export function scenarioRunner(
  plan: FeaturePlan,
  recorder: ConformanceRecorder,
  notApplicable: ReadonlyMap<Capability, string>,
): IJestLike {
  let index = 0;

  const describeFeature = (title: string, body: FeatureBody): void => {
    if (plan.title !== title) {
      throw new Error(
        `provider-tck: expected feature "${plan.title}" (${plan.feature}.feature) but jest-cucumber defined "${title}"`,
      );
    }

    index = 0;
    // Jest evaluates a describe body synchronously while collecting, so every scenario of this
    // feature is defined before this call returns.
    describe(title, body);
  };

  const next = (title: string): PlannedScenario => {
    const scenario = plan.scenarios[index];
    index += 1;

    if (!scenario) {
      throw new Error(
        `provider-tck: ${plan.feature}.feature defined more scenarios than the harness planned ` +
          `for; the extra one is "${title}"`,
      );
    }
    if (scenario.title !== title) {
      throw new Error(
        `provider-tck: expected scenario "${scenario.title}" in ${plan.feature}.feature but ` +
          `jest-cucumber defined "${title}". The report cannot be trusted when the plan and the run ` +
          `disagree, so the suite fails instead.`,
      );
    }

    return scenario;
  };

  const testScenario = (title: string, action: ScenarioAction, timeout?: number): void => {
    const scenario = next(title);

    // The rule Appendix F exists to enforce, checked structurally rather than promised: a scenario
    // the capability gate should have stopped can never reach the branch that records a pass.
    if (scenario.missing.length) {
      throw new Error(
        `provider-tck: "${title}" requires ${scenario.missing.join(' ')}, which this provider does ` +
          `not declare, yet it was about to run. Refusing, because it would be reported as passed.`,
      );
    }

    const complete = recorder.started(identify(plan, scenario));

    test(
      title,
      async () => {
        const startedAt = Date.now();
        try {
          await action();
        } catch (error) {
          complete({ durationMs: Date.now() - startedAt, error });
          throw error;
        }
        complete({ durationMs: Date.now() - startedAt });
      },
      timeout,
    );
  };

  const skipScenario = (title: string, action: ScenarioAction, timeout?: number): void => {
    const scenario = next(title);
    const identity = identify(plan, scenario);

    if (scenario.missing.length) {
      recorder.skipped(identity, scenario.missing);
    } else {
      // jest-cucumber also skips a scenario whose steps are pending. This suite has none, so
      // reaching here means something skipped a scenario the TCK expected to run, and there is no
      // honest outcome for that other than a failure.
      recorder.skippedUnexpectedly(identity, 'the runner skipped this scenario for a reason the TCK did not ask for');
    }

    // The body is never invoked; it is passed on so Jest reports the scenario as skipped rather
    // than as an empty test.
    test.skip(skipDisplayName(scenario, notApplicable), async () => action(), timeout);
  };

  return {
    describe: Object.assign(describeFeature, { skip: describeFeature, only: describeFeature }),
    test: Object.assign(testScenario, {
      skip: skipScenario,
      only: testScenario,
      concurrent: testScenario,
    }),
  };
}

/** Names the scenario an outcome belongs to, in the terms the report records it under. */
function identify(plan: FeaturePlan, scenario: PlannedScenario): ScenarioIdentity {
  return {
    feature: plan.feature,
    name: scenario.name,
    pickleId: scenario.pickleId,
    ...(scenario.example ? { example: scenario.example } : {}),
  };
}

/**
 * The name a skipped scenario is reported under.
 *
 * The reason travels in the name because Jest has nowhere else to put it, and a suite that quietly
 * goes green on scenarios it did not run is worse than no suite at all. The harness composes this
 * itself rather than through jest-cucumber's `scenarioNameTemplate`, which is never applied to
 * Scenario Outline examples -- those were being skipped with no reason shown at all.
 */
export function skipDisplayName(scenario: PlannedScenario, notApplicable: ReadonlyMap<Capability, string>): string {
  if (!scenario.missing.length) {
    return `${scenario.title} — SKIPPED: for a reason the TCK did not ask for`;
  }

  const tags = scenario.missing.join(' ');
  return scenario.missing.every((capability) => notApplicable.has(capability))
    ? `${scenario.title} — NOT APPLICABLE: ${tags} does not apply to this provider`
    : `${scenario.title} — SKIPPED: provider does not declare ${tags}`;
}
