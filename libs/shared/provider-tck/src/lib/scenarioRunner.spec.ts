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

  it('leaves an untagged scenario mandatory whatever the provider declares', () => {
    const mandatory = plansWithout().filter((scenario) => !scenario.missing.length);

    expect(mandatory.length).toBeGreaterThan(0);
    for (const scenario of mandatory) {
      expect(scenario.tags.filter((tag) => Object.values(Capability).includes(tag as Capability))).toEqual([]);
    }
  });
});
