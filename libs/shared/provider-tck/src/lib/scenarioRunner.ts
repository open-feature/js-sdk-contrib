import type { IJestLike, loadFeature } from 'jest-cucumber';
import type { Capability } from './capability';
import { capabilityForTag } from './capability';

/** What `loadFeature` hands back. jest-cucumber does not export the type, so it is derived. */
type ParsedFeature = ReturnType<typeof loadFeature>;
type ParsedScenario = ParsedFeature['scenarios'][number];

/** One scenario, as the harness expects jest-cucumber to define it. */
export interface PlannedScenario {
  /** The title jest-cucumber defines the scenario under; an outline example carries its expanded title. */
  title: string;
  /** Scenario tags and feature tags together, which is what gates the scenario. */
  tags: string[];
  /**
   * The capabilities gating this scenario that the provider does not have.
   *
   * Empty means the scenario runs. Non-empty means the capability gate skips it, and the reason has
   * to be visible when it does.
   */
  missing: Capability[];
}

/**
 * Works out, ahead of the run, exactly which scenarios jest-cucumber will define from a feature and
 * which of them the capability gate will skip.
 *
 * The order matters and is not incidental: `autoBindSteps` defines every plain scenario in file
 * order and then every example of every outline, and the runner below relies on that to know which
 * scenario it is being handed. It asserts the title it receives against the plan at each step, so a
 * change in jest-cucumber's behaviour surfaces as a loud failure rather than a wrong skip reason.
 */
export function planScenarios(parsed: ParsedFeature, declared: ReadonlySet<Capability>): PlannedScenario[] {
  const scenarios: PlannedScenario[] = [];

  const plan = (scenario: ParsedScenario): void => {
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

    scenarios.push({ title: scenario.title, tags, missing });
  };

  parsed.scenarios.forEach(plan);
  for (const outline of parsed.scenarioOutlines) {
    outline.scenarios.forEach(plan);
  }

  return scenarios;
}

/** A Jest `describe` body, typed as jest-cucumber's `TestGroup` expects. */
type FeatureBody = (...args: unknown[]) => void;

/** A Jest test body, typed as jest-cucumber's `FrameworkTestCall` expects. */
type ScenarioAction = (...args: unknown[]) => void | Promise<void> | undefined;

/**
 * Builds the `describe`/`test` pair jest-cucumber calls for one feature, wrapped so that a scenario
 * the capability gate skips is named with the reason it was skipped.
 *
 * jest-cucumber offers `scenarioNameTemplate` for exactly this, and it does not reach far enough:
 * the template is applied to a Scenario Outline's own title, but each example row is defined under
 * its *expanded* title instead, so every skipped example row was reported with no reason shown at
 * all. Four rows of `errors.feature` are in that position whenever `@object` is undeclared. Appendix
 * F requires a skipped scenario to be reported with its reason, so the harness composes the name
 * itself, at the point jest-cucumber makes the `test.skip` call.
 */
export function scenarioRunner(featureTitle: string, planned: readonly PlannedScenario[]): IJestLike {
  let index = 0;

  const describeFeature = (title: string, body: FeatureBody): void => {
    if (title !== featureTitle) {
      throw new Error(`provider-tck: expected feature "${featureTitle}" but jest-cucumber defined "${title}"`);
    }

    index = 0;
    // Jest evaluates a describe body synchronously while collecting, so every scenario of this
    // feature is defined before this call returns.
    describe(title, body);
  };

  const next = (title: string): PlannedScenario => {
    const scenario = planned[index];
    index += 1;

    if (!scenario) {
      throw new Error(
        `provider-tck: "${featureTitle}" defined more scenarios than the harness planned for; ` +
          `the extra one is "${title}"`,
      );
    }
    if (scenario.title !== title) {
      throw new Error(
        `provider-tck: expected scenario "${scenario.title}" in "${featureTitle}" but jest-cucumber ` +
          `defined "${title}". A skip reason cannot be trusted when the plan and the run disagree, ` +
          `so the suite fails instead.`,
      );
    }

    return scenario;
  };

  const testScenario = (title: string, action: ScenarioAction, timeout?: number): void => {
    next(title);
    test(title, async () => action(), timeout);
  };

  const skipScenario = (title: string, action: ScenarioAction, timeout?: number): void => {
    const scenario = next(title);

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

/**
 * The name a skipped scenario is reported under.
 *
 * The reason travels in the name because Jest has nowhere else to put it, and a suite that quietly
 * goes green on scenarios it did not run is worse than no suite at all.
 */
export function skipDisplayName(scenario: PlannedScenario): string {
  return scenario.missing.length
    ? `${scenario.title} — SKIPPED: provider does not declare ${scenario.missing.join(' ')}`
    : // jest-cucumber also skips a scenario whose steps are pending. This suite has none, so reaching
      // here means something skipped a scenario the TCK expected to run.
      `${scenario.title} — SKIPPED: for a reason the TCK did not ask for`;
}
