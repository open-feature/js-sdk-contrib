import type { IJestLike, loadFeature } from 'jest-cucumber';
import type { Capability } from './capability';
import { capabilityForTag } from './capability';
import type { ExampleTable } from './examples';
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
   * The Examples row this scenario came from, keyed by column header, or absent for a scenario that
   * is not an outline example.
   *
   * Together with the feature and the name it identifies the scenario. Nothing else does: eleven
   * rows of `errors.feature`'s type-mismatch matrix share one name, and a report that cannot say
   * which of them failed is ambiguous exactly where it matters most.
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
 */
export function planFeature(
  feature: string,
  parsed: ParsedFeature,
  examples: readonly ExampleTable[],
  declared: ReadonlySet<Capability>,
): FeaturePlan {
  const scenarios: PlannedScenario[] = [];

  const plan = (scenario: ParsedScenario, name: string, example?: Record<string, string>): void => {
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

    scenarios.push({ name, title: scenario.title, ...(example ? { example } : {}), tags, missing });
  };

  parsed.scenarios.forEach((scenario) => plan(scenario, scenario.title));

  parsed.scenarioOutlines.forEach((outline, position) => {
    // The Examples tables are read from the same file by the same parser, so they arrive in the same
    // order as jest-cucumber's expansion. Pairing them positionally is only sound while that holds,
    // so it is checked rather than assumed: a wrong example is worse than none, because it reads as
    // a fact about a row that did not run.
    const table = examples[position];
    if (table?.outline !== outline.title || table.rows.length !== outline.scenarios.length) {
      throw new Error(
        `tck: ${feature}.feature: the Examples rows read for outline ${position} ` +
          `("${table?.outline ?? 'none'}", ${table?.rows.length ?? 0} rows) do not line up with ` +
          `jest-cucumber's expansion of "${outline.title}" (${outline.scenarios.length} scenarios). ` +
          `The report identifies an outline scenario by its example row, so it cannot be built.`,
      );
    }

    outline.scenarios.forEach((scenario, row) => plan(scenario, outline.title, table.rows[row]));
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
export function scenarioRunner(plan: FeaturePlan, recorder: ConformanceRecorder): IJestLike {
  let index = 0;

  const describeFeature = (title: string, body: FeatureBody): void => {
    if (plan.title !== title) {
      throw new Error(
        `tck: expected feature "${plan.title}" (${plan.feature}.feature) but jest-cucumber defined "${title}"`,
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
        `tck: ${plan.feature}.feature defined more scenarios than the harness planned ` +
          `for; the extra one is "${title}"`,
      );
    }
    if (scenario.title !== title) {
      throw new Error(
        `tck: expected scenario "${scenario.title}" in ${plan.feature}.feature but ` +
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
        `tck: "${title}" requires ${scenario.missing.join(' ')}, which this provider does ` +
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
    test.skip(skipDisplayName(scenario), async () => action(), timeout);
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
    ...(scenario.example ? { example: scenario.example } : {}),
    tags: scenario.tags,
  };
}

/**
 * The name a skipped scenario is reported under.
 *
 * The reason travels in the name because Jest has nowhere else to put it, and a suite that quietly
 * goes green on scenarios it did not run is worse than no suite at all.
 *
 * One skip carrying its reason is the whole mechanism. "Does not declare it" and "cannot hold for
 * it at all" are both skips, and a second wording for the second case tells a reader nothing this
 * one does not: the scenario's own tags say what was asked and the declaration says whether it was
 * claimed. Where a capability cannot hold in the language at all — `@numeric-coercion` here — that
 * is a property of the SDK rather than of the provider, and it is recorded once against
 * {@link Capability.NumericCoercion} and in Appendix F instead of restated in every run.
 */
export function skipDisplayName(scenario: PlannedScenario): string {
  if (!scenario.missing.length) {
    // jest-cucumber also skips a scenario whose steps are pending. This suite has none, so reaching
    // here means something skipped a scenario the TCK expected to run.
    return `${scenario.title} — SKIPPED: for a reason the TCK did not ask for`;
  }

  return `${scenario.title} — SKIPPED: provider does not declare ${scenario.missing.join(' ')}`;
}
