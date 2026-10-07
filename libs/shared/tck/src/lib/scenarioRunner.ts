import type { IJestLike, loadFeature } from 'jest-cucumber';
import type { Capability } from './capability';
import { capabilityForTag, inexpressibleReason, isInexpressible } from './capability';

/** What `loadFeature` hands back. jest-cucumber does not export the type, so it is derived. */
type ParsedFeature = ReturnType<typeof loadFeature>;
type ParsedScenario = ParsedFeature['scenarios'][number];

/** One scenario, as the harness expects jest-cucumber to define it. */
export interface PlannedScenario {
  /** The title jest-cucumber defines the scenario under; an outline example carries its expanded title. */
  title: string;
  /** Scenario tags and feature tags together, which is what gates the scenario. */
  tags: string[];
  /** The capabilities gating this scenario that the provider does not have; empty means it runs. */
  missing: Capability[];
}

/**
 * Works out, ahead of the run, exactly which scenarios jest-cucumber will define from a feature and
 * which of them the capability gate will skip.
 *
 * The order is load-bearing: `autoBindSteps` defines every plain scenario in file order and then
 * every example of every outline, and the runner below relies on that to know which scenario it is
 * being handed. It asserts each title against the plan, so a change in jest-cucumber's behaviour
 * surfaces as a loud failure rather than a wrong skip reason.
 */
export function planScenarios(parsed: ParsedFeature, declared: ReadonlySet<Capability>): PlannedScenario[] {
  const scenarios: PlannedScenario[] = [];

  const plan = (scenario: ParsedScenario): void => {
    const tags = Array.from(new Set([...scenario.tags, ...parsed.tags]));
    const missing: Capability[] = [];

    for (const tag of tags) {
      const capability = capabilityForTag(tag);
      // An unknown tag gates nothing, so it cannot make a scenario skip; the harness raises it from
      // the planned tags instead -- see `unknownCapabilityTags`. Planning stays total either way, so
      // the failure names every offending tag at once.
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
 * Not `scenarioNameTemplate`, which does not reach far enough: it is applied to a Scenario Outline's
 * own title while each example row is defined under its *expanded* title, so a skipped example row
 * shows no reason at all. The harness composes the name itself, at the point jest-cucumber makes the
 * `test.skip` call.
 */
export function scenarioRunner(featureTitle: string, planned: readonly PlannedScenario[]): IJestLike {
  let index = 0;

  const describeFeature = (title: string, body: FeatureBody): void => {
    if (title !== featureTitle) {
      throw new Error(`tck: expected feature "${featureTitle}" but jest-cucumber defined "${title}"`);
    }

    index = 0;
    // Jest evaluates a describe body synchronously, so every scenario of this feature is defined
    // before this call returns.
    describe(title, body);
  };

  const next = (title: string): PlannedScenario => {
    const scenario = planned[index];
    index += 1;

    if (!scenario) {
      throw new Error(
        `tck: "${featureTitle}" defined more scenarios than the harness planned for; the extra one is "${title}"`,
      );
    }
    if (scenario.title !== title) {
      throw new Error(
        `tck: expected scenario "${scenario.title}" in "${featureTitle}" but jest-cucumber ` +
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

    // Never invoked; passed on so Jest reports a skipped scenario rather than an empty test.
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
 * The reason travels in the name because Jest has nowhere else to put it. **The wordings for the two
 * cases differ deliberately**: a capability the provider declined to declare says something about the
 * provider, and one this SDK cannot express says nothing about it at all, so the second carries the
 * language property with it rather than leaving it a lookup away in `Capability`.
 *
 * A scenario is gated by *every* capability tag that applies to it, so both clauses are emitted when
 * both apply, each naming its own capabilities.
 */
export function skipDisplayName(scenario: PlannedScenario): string {
  if (!scenario.missing.length) {
    // jest-cucumber also skips a scenario whose steps are pending; this suite has none, so reaching
    // here means something skipped a scenario the TCK expected to run.
    return `${scenario.title} — SKIPPED: for a reason the TCK did not ask for`;
  }

  const undeclared = scenario.missing.filter((capability) => !isInexpressible(capability));
  const inexpressible = scenario.missing.filter(isInexpressible);

  const reasons: string[] = [];
  if (undeclared.length) {
    reasons.push(`provider does not declare ${undeclared.join(' ')}`);
  }
  for (const capability of inexpressible) {
    reasons.push(`this SDK cannot ask ${capability} of any provider: ${inexpressibleReason(capability)}`);
  }

  return `${scenario.title} — SKIPPED: ${reasons.join('; ')}`;
}
