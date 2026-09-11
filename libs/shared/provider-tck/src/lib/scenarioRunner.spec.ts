import { loadFeatures, parseFeature } from 'jest-cucumber';
import { Capability } from './capability';
import { planScenarios, skipDisplayName } from './scenarioRunner';
import { FEATURES_GLOB } from './runProviderTck';

/** The canonical features, with `@object` deliberately undeclared so its scenarios are gated. */
const features = loadFeatures(FEATURES_GLOB);

const plansWithout = (...declared: Capability[]) =>
  features.flatMap((parsed) => planScenarios(parsed, new Set(declared)));

describe('the capability gate', () => {
  it('names every skipped scenario with the reason it was skipped', () => {
    // Appendix F requires a skipped scenario to be reported *with the reason*. Jest has nowhere to
    // put it but the name, so every gated scenario has to carry it there.
    const gated = plansWithout(Capability.Events, Capability.ConfigurationChange).filter(
      (scenario) => scenario.missing.length,
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const scenario of gated) {
      expect(skipDisplayName(scenario)).toContain('SKIPPED: provider does not declare');
      for (const capability of scenario.missing) {
        expect(skipDisplayName(scenario)).toContain(capability);
      }
    }
  });

  it('reaches the example rows of a Scenario Outline, which scenarioNameTemplate does not', () => {
    // The regression this guards. jest-cucumber applies `scenarioNameTemplate` to an outline's own
    // title and then defines each example row under its *expanded* title instead, so the four
    // @object rows in errors.feature were being skipped with no reason shown at all.
    const objectScenarios = plansWithout(Capability.Events).filter((scenario) =>
      scenario.tags.includes(Capability.Object),
    );

    // Two outlines carry @object: four example rows in errors.feature and one scenario in
    // evaluation.feature.
    expect(objectScenarios.length).toBeGreaterThan(1);
    for (const scenario of objectScenarios) {
      expect(scenario.missing).toContain(Capability.Object);
      expect(skipDisplayName(scenario)).toBe(
        `${scenario.title} — SKIPPED: provider does not declare ${Capability.Object}`,
      );
    }
  });

  it('plans one entry per example row, not one per outline', () => {
    // errors.feature's type-mismatch matrix is 11 example rows under one Scenario Outline. A plan
    // that collapsed them would skip or run ten scenarios without saying so.
    const all = plansWithout(...Object.values(Capability));
    const matrix = all.filter((scenario) => scenario.title === 'Requesting the wrong type returns the code default');

    expect(matrix).toHaveLength(11);
  });

  it('gates one Examples block of an outline without gating the others', () => {
    // Gherkin permits tags on an individual Examples block, so two rows of the same outline can
    // differ in whether the gate stops them. No canonical feature does this today, which is exactly
    // why it is worth pinning: a plan keyed on the scenario name would gate all four rows together,
    // and the rows that should have run would disappear. The plan is positional instead.
    const parsed = parseFeature(
      [
        'Feature: mixed examples',
        '',
        '  Scenario Outline: a <what> flag',
        '    Given a String-flag with key "string-flag" and a default value "<what>"',
        '',
        '    Examples: plain',
        '      | what  |',
        '      | plain |',
        '',
        '    @object',
        '    Examples: structured',
        '      | what         |',
        '      | structured   |',
        '',
      ].join('\n'),
    );

    const planned = planScenarios(parsed, new Set([Capability.Events]));

    expect(planned.map((scenario) => [scenario.title, scenario.missing])).toEqual([
      ['a plain flag', []],
      ['a structured flag', [Capability.Object]],
    ]);
    expect(skipDisplayName(planned[1])).toContain('@object');
  });

  it('loads every canonical feature, the metadata one included', () => {
    // Feature files are discovered from the asset directory rather than enumerated, so a file
    // arriving upstream is picked up without a wiring change here. This pins that it was: a
    // feature the harness quietly failed to load would be the one kind of gap nothing else reports.
    expect(features.map((parsed) => parsed.title).sort()).toEqual([
      'Provider error handling',
      'Provider events',
      'Provider flag evaluation',
      'Provider lifecycle',
      'Provider metadata',
    ]);
  });

  it('gates both halves of @numeric-coercion on the tag, not only the lossy one', () => {
    // The lossless scenarios arrived with the integral float in the canonical flag set. They carry
    // the same tag, so a JavaScript suite -- which cannot declare it, the language having one
    // numeric type -- must see all three skipped and none of them fail.
    const gated = plansWithout(Capability.Events).filter((scenario) =>
      scenario.missing.includes(Capability.NumericCoercion),
    );

    expect(gated.map((scenario) => scenario.title).sort()).toEqual([
      'A float flag is not silently narrowed to an integer',
      'An integer requested as a float is widened without loss',
      'An integral float requested as an integer is coerced without loss',
    ]);
    for (const scenario of gated) {
      expect(scenario.missing).toEqual([Capability.NumericCoercion]);
      expect(skipDisplayName(scenario)).toContain('SKIPPED: provider does not declare');
    }
  });

  it('gates the 2^53 - 1 scenario on @large-integers and leaves the 2^31 - 1 one mandatory', () => {
    // Accessor width is a property of the SDK rather than of the provider, so only the value a
    // 32-bit accessor cannot ask for is tagged. The other precision scenario runs for everyone.
    const all = plansWithout(Capability.Events);
    const titled = (title: string) => all.find((scenario) => scenario.title === title);

    expect(titled('An integer beyond 32 bits resolves without loss of precision')?.missing).toEqual([
      Capability.LargeIntegers,
    ]);
    expect(titled('A large integer resolves without loss of precision')?.missing).toEqual([]);
  });

  it('gives an undeclared capability one skip wording, whatever the reason it went undeclared', () => {
    // One skip carrying its reason is the whole mechanism. A capability the provider chose not to
    // declare and one that cannot hold in the language at all are both skips, and the scenario's
    // own tags already say what was asked -- so there is no second wording to get wrong, and no
    // way for an adoption to dress a gap up as an impossibility.
    const gated = plansWithout(Capability.Events).filter((scenario) =>
      scenario.missing.includes(Capability.NumericCoercion),
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const scenario of gated) {
      expect(skipDisplayName(scenario)).toBe(
        `${scenario.title} — SKIPPED: provider does not declare ${Capability.NumericCoercion}`,
      );
    }
  });

  it('names every capability a scenario is missing, not only the first', () => {
    // A scenario gated by two capabilities is skipped for both, and a reader has to be able to see
    // which: withdrawing either one is enough to keep it from running.
    const [planned] = plansWithout().filter((scenario) => scenario.missing.length > 1);

    expect(planned.missing.length).toBeGreaterThan(1);
    for (const capability of planned.missing) {
      expect(skipDisplayName(planned)).toContain(capability);
    }
  });

  it('leaves an untagged scenario mandatory whatever the provider declares', () => {
    const mandatory = plansWithout().filter((scenario) => !scenario.missing.length);

    expect(mandatory.length).toBeGreaterThan(0);
    for (const scenario of mandatory) {
      expect(scenario.tags.filter((tag) => Object.values(Capability).includes(tag as Capability))).toEqual([]);
    }
  });
});
