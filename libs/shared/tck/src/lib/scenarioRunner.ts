import type { IJestLike, loadFeature } from 'jest-cucumber';
import type { AdopterTagSelection } from './adopterTags';
import { adopterSkipReason } from './adopterTags';
import type { Capability } from './capability';
import { capabilityForTag, inexpressibleReason, isInexpressible } from './capability';
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
  /** The capabilities gating this scenario that the provider does not have; empty means it runs. */
  missing: Capability[];
  /**
   * Why the adopter's own tag selection deselects this scenario, or `undefined` where it does not.
   *
   * Always `undefined` for a canonical scenario: the exemption is applied by withholding the
   * selection from the plan rather than tested for here, so no path through this module can skip a
   * conformance scenario on an adopter's tag.
   */
  deselectedBecause?: string;
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
 * The order is load-bearing: `autoBindSteps` defines every plain scenario in file order and then
 * every example of every outline, and the runner below relies on that to know which scenario it is
 * being handed. It asserts each title against the plan, so a change in jest-cucumber's behaviour
 * surfaces as a loud failure rather than a wrong skip reason.
 *
 * `selection` is the adopter's own tag selection, and is passed **only for an extension feature**.
 * Withholding it for the canonical set is what exempts a conformance scenario from being deselected,
 * and is the same decision that withholds the selection's tag filter when the file is loaded.
 */
export function planFeature(
  feature: string,
  parsed: ParsedFeature,
  compiled: readonly PickledScenario[],
  declared: ReadonlySet<Capability>,
  selection?: AdopterTagSelection,
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
      `tck: ${feature}.feature: jest-cucumber defines ${defined.length} scenarios but the ` +
        `Gherkin compiler produced ${compiled.length}. The report identifies a scenario by its ` +
        `pickle, so it cannot be built when the two disagree.`,
    );
  }

  const scenarios = defined.map(({ scenario, name }, position) => {
    const { pickle, example } = compiled[position];
    if (pickle.name !== scenario.title) {
      throw new Error(
        `tck: ${feature}.feature: jest-cucumber's scenario ${position} is ` +
          `"${scenario.title}" but the pickle at that position is "${pickle.name}". Pairing them ` +
          `positionally is only sound while both derive from the same parse of the same file, and a ` +
          `wrong pairing would report an outcome against a scenario that did not run.`,
      );
    }

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

    return {
      name,
      title: scenario.title,
      pickleId: pickle.id,
      ...(example ? { example } : {}),
      tags,
      missing,
      // Planned alongside the capability gate because a scenario can be skipped by each for its own
      // reason, and the name it is reported under has to carry both.
      deselectedBecause: selection ? adopterSkipReason(tags, selection) : undefined,
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
 * Not `scenarioNameTemplate`, which does not reach far enough: it is applied to a Scenario Outline's
 * own title while each example row is defined under its *expanded* title, so a skipped example row
 * shows no reason at all. The harness composes the name itself, at the point jest-cucumber makes the
 * `test.skip` call.
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
    // Jest evaluates a describe body synchronously, so every scenario of this feature is defined
    // before this call returns.
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

    // The same tiers skipDisplayName applies, so the report and the run name the same reason.
    if (scenario.missing.some(isInexpressible)) {
      recorder.skipped(identity, scenario.missing);
    } else if (scenario.deselectedBecause) {
      recorder.deselected(identity, scenario.deselectedBecause);
    } else if (scenario.missing.length) {
      recorder.skipped(identity, scenario.missing);
    } else {
      // jest-cucumber also skips a scenario whose steps are pending. This suite has none, so
      // reaching here means something skipped a scenario the TCK expected to run, and there is no
      // honest outcome for that other than a failure.
      recorder.skippedUnexpectedly(identity, 'the runner skipped this scenario for a reason the TCK did not ask for');
    }

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
 * The reason travels in the name because Jest has nowhere else to put it. **The wordings for the two
 * cases differ deliberately**: a capability the provider declined to declare says something about the
 * provider, and one this SDK cannot express says nothing about it at all, so the second carries the
 * language property with it rather than leaving it a lookup away in `Capability`.
 *
 * A scenario is gated by *every* capability tag that applies to it, so both clauses are emitted when
 * both apply, each naming its own capabilities.
 *
 * **The reasons are tiered, narrowest applicability last**, and the applicable tier reports alone:
 *
 *  1. Hard vocabulary checks — a reserved tag, or a canonical tag this library does not know — fail
 *     the whole run, and so precede everything here. They live in `runProviderTck`, over the whole
 *     plan rather than over what ran, which is why no skip below can mask one.
 *  2. A capability this SDK cannot express. Permanent, language-wide, and nothing to do with this
 *     adoption, so it never loses to anything an adoption configured.
 *  3. The adopter's own tag selection.
 *  4. The capability declaration.
 *
 * Three above four is the ordering that matters: a scenario the adoption *deselected* is not a
 * capability the provider *withheld*. Reporting the declaration first would make a conformance
 * report say the provider declined something this suite never put to it.
 */
export function skipDisplayName(scenario: PlannedScenario): string {
  const undeclared = scenario.missing.filter((capability) => !isInexpressible(capability));
  const inexpressible = scenario.missing.filter(isInexpressible);

  const reasons: string[] = [];
  if (inexpressible.length) {
    // Tier 2, and with it the whole capability picture: the undeclared clause stays alongside, each
    // naming its own capabilities, because the two say different things about the same scenario.
    if (undeclared.length) {
      reasons.push(`provider does not declare ${undeclared.join(' ')}`);
    }
    for (const capability of inexpressible) {
      reasons.push(`this SDK cannot ask ${capability} of any provider: ${inexpressibleReason(capability)}`);
    }
  } else if (scenario.deselectedBecause) {
    // Tier 3, reporting alone: the suite never asked this scenario, so there is no capability the
    // provider can be said to have withheld.
    reasons.push(scenario.deselectedBecause);
  } else if (undeclared.length) {
    reasons.push(`provider does not declare ${undeclared.join(' ')}`);
  }

  if (!reasons.length) {
    // jest-cucumber also skips a scenario whose steps are pending; this suite has none, so reaching
    // here means something skipped a scenario the TCK expected to run.
    return `${scenario.title} — SKIPPED: for a reason the TCK did not ask for`;
  }

  return `${scenario.title} — SKIPPED: ${reasons.join('; ')}`;
}
