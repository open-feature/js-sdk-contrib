import { IdGenerator } from '@cucumber/messages';
import { parseFeature } from 'jest-cucumber';
import { Capability } from './capability';
import { readFeatureMessages } from './messages';
import { planFeature, skipDisplayName } from './scenarioRunner';
import { loadTckFeatures } from './runProviderTck';

/** The canonical features, unfiltered, with their compiled scenarios. */
const features = loadTckFeatures(undefined);

/** No capability is inapplicable in these cases; that distinction is the report's, not the gate's. */
const NONE: ReadonlyMap<Capability, string> = new Map();

const plansWithout = (...declared: Capability[]) =>
  features.flatMap(
    ({ feature, parsed, messages }) => planFeature(feature, parsed, messages.planned, new Set(declared)).scenarios,
  );

/** Plans a feature written inline, so a shape the canonical files do not have can still be pinned. */
const synthetic = (lines: string[], declared: Capability[] = []) => {
  const source = lines.join('\n');

  return planFeature(
    'synthetic',
    parseFeature(source),
    readFeatureMessages('synthetic.feature', source, IdGenerator.incrementing()).planned,
    new Set(declared),
  ).scenarios;
};

describe('the capability gate', () => {
  it('names every skipped scenario with the reason it was skipped', () => {
    // Appendix F requires a skipped scenario to be reported *with the reason*. Jest has nowhere to
    // put it but the name, so every gated scenario has to carry it there.
    const gated = plansWithout(Capability.Events, Capability.ConfigurationChange).filter(
      (scenario) => scenario.missing.length,
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const scenario of gated) {
      expect(skipDisplayName(scenario, NONE)).toContain('SKIPPED: provider does not declare');
      for (const capability of scenario.missing) {
        expect(skipDisplayName(scenario, NONE)).toContain(capability);
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
      expect(skipDisplayName(scenario, NONE)).toBe(
        `${scenario.title} — SKIPPED: provider does not declare ${Capability.Object}`,
      );
    }
  });

  it('plans one entry per example row, not one per outline', () => {
    // errors.feature's type-mismatch matrix is 11 example rows under one Scenario Outline. A plan
    // that collapsed them would skip or run ten scenarios without saying so.
    const matrix = plansWithout(...Object.values(Capability)).filter(
      (scenario) => scenario.name === 'Requesting the wrong type returns the code default',
    );

    expect(matrix).toHaveLength(11);
  });

  it('gates one Examples block of an outline without gating the others', () => {
    // Gherkin permits tags on an individual Examples block, so two rows of the same outline can
    // differ in whether the gate stops them. No canonical feature does this today, which is exactly
    // why it is worth pinning: a plan keyed on the scenario name would gate both rows together, and
    // the row that should have run would disappear. The plan is positional instead.
    const planned = synthetic(
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
        '      | what       |',
        '      | structured |',
        '',
      ],
      [Capability.Events],
    );

    expect(planned.map((scenario) => [scenario.title, scenario.example, scenario.missing])).toEqual([
      ['a plain flag', { what: 'plain' }, []],
      ['a structured flag', { what: 'structured' }, [Capability.Object]],
    ]);
    expect(skipDisplayName(planned[1], NONE)).toContain('@object');
  });

  it('leaves an untagged scenario mandatory whatever the provider declares', () => {
    const mandatory = plansWithout().filter((scenario) => !scenario.missing.length);

    expect(mandatory.length).toBeGreaterThan(0);
    for (const scenario of mandatory) {
      expect(scenario.tags.filter((tag) => Object.values(Capability).includes(tag as Capability))).toEqual([]);
    }
  });
});

describe('binding a planned scenario to its pickle', () => {
  const planned = plansWithout(...Object.values(Capability));

  it('gives every planned scenario a distinct pickle', () => {
    // The pickle is what carries the outcome in the results stream, so two scenarios sharing one
    // would report the same result twice and lose the other.
    const ids = planned.map((scenario) => scenario.pickleId);

    expect(ids).not.toContain('');
    expect(new Set(ids).size).toBe(planned.length);
  });

  it('binds each scenario to the pickle of the same scenario', () => {
    // jest-cucumber substitutes an outline row into the scenario title and so does the pickle
    // compiler, so the two strings agree -- which is what makes the positional pairing checkable.
    for (const { feature, parsed, messages } of features) {
      const plan = planFeature(feature, parsed, messages.planned, new Set()).scenarios;
      const byId = new Map(messages.planned.map(({ pickle }) => [pickle.id, pickle]));

      for (const scenario of plan) {
        expect(byId.get(scenario.pickleId)?.name).toBe(scenario.title);
      }
    }
  });

  it('refuses to plan when jest-cucumber and the compiler disagree on how many scenarios there are', () => {
    // A wrong pairing is worse than none: it reports an outcome against a scenario that did not run.
    const source = ['Feature: drifted', '', '  Scenario: alpha', '    Given a stable provider', ''].join('\n');

    expect(() => planFeature('drifted', parseFeature(source), [], new Set())).toThrow(
      /defines 1 scenarios but the Gherkin compiler produced 0/,
    );
  });

  it('refuses to plan when the scenario at a position is not the pickle at that position', () => {
    const mine = ['Feature: mine', '', '  Scenario: alpha', '    Given a stable provider', ''].join('\n');
    const theirs = ['Feature: theirs', '', '  Scenario: beta', '    Given a stable provider', ''].join('\n');
    const compiled = readFeatureMessages('theirs.feature', theirs, IdGenerator.incrementing());

    expect(() => planFeature('mine', parseFeature(mine), compiled.planned, new Set())).toThrow(
      /is "alpha" but the pickle at that position is "beta"/,
    );
  });
});

describe('the example a scenario came from', () => {
  const planned = plansWithout(...Object.values(Capability));

  it('names an outline scenario as the feature file writes it, placeholders and all', () => {
    // Not jest-cucumber's expanded title. That string is the runner's, and Go's and Python's runners
    // produce different ones for the same row, which defeats the comparison the report exists for.
    const outlineTitles = features.flatMap(({ parsed }) => parsed.scenarioOutlines.map((outline) => outline.title));

    for (const scenario of planned.filter((entry) => entry.example)) {
      expect(outlineTitles).toContain(scenario.name);
    }
  });

  it('gives every row of the type-mismatch matrix a distinct example', () => {
    const matrix = planned.filter((scenario) => scenario.name === 'Requesting the wrong type returns the code default');

    expect(matrix.map((scenario) => scenario.example)).toEqual([
      { key: 'string-flag', requested: 'Boolean', default: 'false' },
      { key: 'string-flag', requested: 'Integer', default: '1' },
      { key: 'string-flag', requested: 'Float', default: '0.1' },
      { key: 'wrong-flag', requested: 'Boolean', default: 'false' },
      { key: 'boolean-flag', requested: 'String', default: 'fallback' },
      { key: 'boolean-flag', requested: 'Integer', default: '1' },
      { key: 'boolean-flag', requested: 'Float', default: '0.1' },
      { key: 'integer-flag', requested: 'Boolean', default: 'false' },
      { key: 'integer-flag', requested: 'String', default: 'fallback' },
      { key: 'float-flag', requested: 'Boolean', default: 'false' },
      { key: 'float-flag', requested: 'String', default: 'fallback' },
    ]);
  });

  it('keeps cell contents as strings, because Gherkin has no types', () => {
    for (const scenario of planned) {
      for (const value of Object.values(scenario.example ?? {})) {
        expect(typeof value).toBe('string');
      }
    }
  });

  it('omits the example for a scenario that is not an outline row', () => {
    const plain = planned.filter((scenario) => !scenario.example);

    expect(plain.length).toBeGreaterThan(0);
    for (const scenario of plain) {
      expect(scenario).not.toHaveProperty('example');
    }
  });

  it('carries the example on a capability-skipped row too', () => {
    // A skipped row is still a row, and the harness has to be able to name it in a diagnostic.
    const skipped = plansWithout(Capability.Events).filter(
      (scenario) => scenario.missing.includes(Capability.Object) && scenario.example,
    );

    expect(skipped.map((scenario) => scenario.example)).toEqual([
      { requested: 'Boolean', default: 'false' },
      { requested: 'String', default: 'fallback' },
      { requested: 'Integer', default: '1' },
      { requested: 'Float', default: '0.1' },
    ]);
  });
});
