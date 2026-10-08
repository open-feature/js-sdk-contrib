import { IdGenerator } from '@cucumber/messages';
import { parseFeature } from 'jest-cucumber';
import { Capability, DECLARABLE_CAPABILITIES, INEXPRESSIBLE_CAPABILITIES, inexpressibleReason } from './capability';
import { readFeatureMessages } from './messages';
import { planFeature, skipDisplayName } from './scenarioRunner';
import { loadTckFeatures } from './runProviderTck';

/** The canonical features, unfiltered, with their compiled scenarios. */
const features = loadTckFeatures(undefined);

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
    // Jest has nowhere to put the reason but the name, so every gated scenario carries it there.
    const gated = plansWithout(Capability.Events, Capability.ConfigurationChange).filter(
      (scenario) => scenario.missing.length,
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const scenario of gated) {
      expect(skipDisplayName(scenario)).toContain('SKIPPED: ');
      for (const capability of scenario.missing) {
        expect(skipDisplayName(scenario)).toContain(capability);
      }
    }
  });

  it('reaches the example rows of a Scenario Outline, which scenarioNameTemplate does not', () => {
    // The regression this guards: jest-cucumber applies `scenarioNameTemplate` to an outline's own
    // title and defines each example row under its *expanded* title, so a skipped row showed no
    // reason at all. @string-typing and @fully-typed-values are declared so @object is the only
    // capability missing here; composition is covered by 'names every capability a scenario is
    // missing'.
    const objectScenarios = plansWithout(
      Capability.Events,
      Capability.StringTyping,
      Capability.FullyTypedValues,
    ).filter((scenario) => scenario.tags.includes(Capability.Object));

    expect(objectScenarios.length).toBeGreaterThan(1);
    for (const scenario of objectScenarios) {
      expect(scenario.missing).toContain(Capability.Object);
      expect(skipDisplayName(scenario)).toBe(
        `${scenario.title} — SKIPPED: provider does not declare ${Capability.Object}`,
      );
    }
  });

  it('plans one entry per example row, not one per outline', () => {
    // A plan that collapsed an outline's example rows would skip or run the rest without saying so.
    const matrix = plansWithout(...Object.values(Capability)).filter(
      (scenario) => scenario.name === 'Requesting the wrong type returns the code default',
    );

    expect(matrix).toHaveLength(8);
  });

  it('gates one Examples block of an outline without gating the others', () => {
    // Gherkin permits tags on an individual Examples block, and no canonical feature does it today,
    // which is why it is worth pinning: a plan keyed on the scenario name would gate every row of
    // the outline together. The plan is positional instead.
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
    expect(skipDisplayName(planned[1])).toContain('@object');
  });

  it('loads every canonical feature, the metadata one included', () => {
    // Features are discovered rather than enumerated, so a file arriving upstream needs no wiring
    // change -- and one the harness quietly failed to load is a gap nothing else reports.
    expect(features.map(({ parsed }) => parsed.title).sort()).toEqual([
      'Provider error handling',
      'Provider events',
      'Provider flag evaluation',
      'Provider lifecycle',
      'Provider metadata',
      'Provider resolution reasons',
    ]);
  });

  it('has a canonical scenario for every declarable capability, so none of them gates nothing', () => {
    // The mirror of the harness's reserved-expiry check: a capability an adopter may declare that no
    // canonical scenario carries gates nothing and puts an unexamined claim in a report. It is also
    // the only guard that catches a stale copy of the assets, which is internally consistent with
    // itself and so collects, plans and passes with the new capability gating nothing. Worth pinning
    // because the assets and this file move on separate mechanisms -- a submodule gitlink and a
    // rollup asset glob, either updatable without the other.
    const carried = new Set(plansWithout().flatMap((scenario) => scenario.tags));

    expect(DECLARABLE_CAPABILITIES.filter((capability) => !carried.has(capability))).toEqual([]);

    // The inexpressible ones are held to the same requirement, which is what tells them apart from
    // a reservation: their scenarios exist. One that stopped being carried would make the refusal in
    // options.ts a refusal of nothing.
    expect(Object.keys(INEXPRESSIBLE_CAPABILITIES).filter((capability) => !carried.has(capability))).toEqual([]);
  });

  it('gates both halves of @numeric-coercion on the tag, not only the lossy one', () => {
    // All three carry the same tag, so a JavaScript suite -- which cannot declare it -- must see
    // all three skipped and none of them fail.
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
      expect(skipDisplayName(scenario)).toContain('SKIPPED: this SDK cannot ask');
    }
  });

  it('gates the 2^53 - 1 scenario on @large-integers and leaves the 2^31 - 1 one mandatory', () => {
    // Accessor width is a property of the SDK, so only the value a 32-bit accessor cannot ask for is
    // tagged; the other precision scenario runs for everyone.
    const all = plansWithout(Capability.Events);
    const titled = (title: string) => all.find((scenario) => scenario.title === title);

    expect(titled('An integer beyond 32 bits resolves without loss of precision')?.missing).toEqual([
      Capability.LargeIntegers,
    ]);
    expect(titled('A large integer resolves without loss of precision')?.missing).toEqual([]);
  });

  it('gates the four string-accessor scenarios and leaves the rest of the matrix mandatory', () => {
    // The tag narrows the mandatory matrix rather than adding coverage, and the rows left behind
    // must still be mandatory: a registration that gated the wrong ones would quietly excuse a real
    // mismatch. @fully-typed-values narrows two of these further rather than taking them away, so a
    // provider withholding both still sees all four skipped.
    const gated = plansWithout(Capability.Events).filter((scenario) =>
      scenario.missing.includes(Capability.StringTyping),
    );

    expect(gated.map((scenario) => scenario.title).sort()).toEqual([
      'A float flag is not returned as its string representation',
      'A non-string flag is not returned as its string representation',
      'A non-string flag is not returned as its string representation',
      'A structured flag is not returned as its JSON text',
    ]);

    // Only the structured one composes with @object, a provider with no structured values having no
    // way to be asked at all.
    const composed = gated.filter((scenario) => scenario.missing.includes(Capability.Object));
    expect(composed.map((scenario) => scenario.title)).toEqual(['A structured flag is not returned as its JSON text']);

    // Withdrawing it withdraws only the string-accessor claim.
    const mandatory = plansWithout()
      .filter((scenario) => !scenario.missing.length)
      .map((scenario) => scenario.title);
    expect(mandatory.filter((title) => title === 'Requesting the wrong type returns the code default')).toHaveLength(8);
  });

  it('splits the float and structured cases onto @fully-typed-values, and the two outline rows not', () => {
    // The asymmetry is the point: a partially typed backend declares @string-typing and withholds
    // @fully-typed-values, so the boolean and integer rows must *run* for it while the float and
    // structured ones skip. Putting the outline behind both tags would restore the coarse gate, and
    // a provider's own stringification defect would read as a permitted backend absence again.
    const declaredStringTypingOnly = plansWithout(Capability.Events, Capability.Object, Capability.StringTyping);

    const gated = declaredStringTypingOnly.filter((scenario) => scenario.missing.includes(Capability.FullyTypedValues));
    expect(gated.map((scenario) => scenario.title).sort()).toEqual([
      'A float flag is not returned as its string representation',
      'A structured flag is not returned as its JSON text',
    ]);

    // The two rows a partially typed store can still answer, which must be left running: a provider
    // failing them is failing on its own code.
    const running = declaredStringTypingOnly
      .filter((scenario) => !scenario.missing.length)
      .map((scenario) => scenario.title);
    expect(
      running.filter((title) => title === 'A non-string flag is not returned as its string representation'),
    ).toHaveLength(2);
  });

  it('gates every variant assertion on @variants, and gates nothing else on it', () => {
    // The variant assertions are one outline, so a provider leaving the tag undeclared sees skips
    // and no failures -- and the value scenarios it shares flags with still run.
    const gated = plansWithout(Capability.Events).filter((scenario) => scenario.missing.includes(Capability.Variants));

    expect(gated).toHaveLength(8);
    for (const scenario of gated) {
      expect(scenario.title).toBe('The resolved details name the variant');
      expect(scenario.missing).toEqual([Capability.Variants]);
    }

    // Withdrawing @variants withdraws the variant claim and nothing else.
    const mandatory = plansWithout(Capability.Events).filter((scenario) => !scenario.missing.length);
    expect(mandatory.map((scenario) => scenario.title)).toContain('Resolve values');
    expect(mandatory.map((scenario) => scenario.title)).toContain('A falsy value is a value, not an absence');
  });

  it('gates the three @targeting scenarios, which are no longer a reservation', () => {
    // Filtered on @targeting being the *only* thing missing, because reason.feature composes it
    // with @standard-reasons -- see the composition test below.
    const gated = plansWithout(Capability.Events).filter(
      (scenario) => scenario.missing.length === 1 && scenario.missing[0] === Capability.Targeting,
    );

    expect(gated.map((scenario) => scenario.title).sort()).toEqual([
      'A matching evaluation context resolves the targeted variant',
      'A non-matching evaluation context resolves the default variant',
      'No evaluation context resolves the default variant',
    ]);
  });

  it('gates the whole of reason.feature on @standard-reasons, and nothing else on it', () => {
    // The tag is on the Feature rather than on any scenario, which a plan keyed on scenario tags
    // alone would miss: `planScenarios` unions the feature's tags into every scenario's, and this is
    // the only canonical file relying on it.
    const gated = plansWithout(Capability.Events).filter((scenario) =>
      scenario.missing.includes(Capability.StandardReasons),
    );

    expect(gated).toHaveLength(9);
    expect(
      gated.filter((scenario) => scenario.title === 'A flag with no targeting rules resolves statically'),
    ).toHaveLength(4);

    // Withdrawing it withdraws only the reason claim.
    const mandatory = plansWithout()
      .filter((scenario) => !scenario.missing.length)
      .map((scenario) => scenario.title);
    expect(mandatory).toContain('Resolve values');
    expect(mandatory).toContain('An unknown flag key returns the code default');
  });

  it('composes @standard-reasons with the capability each reason needs to be observable', () => {
    // TARGETING_MATCH cannot be observed without targeting, and DISABLED unless the backend
    // distinguishes a disabled flag, so some scenarios carry a second tag -- which is why the skip
    // names every missing capability rather than the first.
    const composed = plansWithout(Capability.Events, Capability.StandardReasons).filter(
      (scenario) => scenario.missing.length,
    );
    const inReasonFeature = composed.filter((scenario) => scenario.tags.includes(Capability.StandardReasons));

    expect(inReasonFeature.map((scenario) => scenario.title).sort()).toEqual([
      'A disabled flag reports that it is disabled',
      'A matching targeting rule reports a targeting match',
      'A targeting rule that does not match reports the default',
    ]);
    for (const scenario of inReasonFeature) {
      expect(scenario.missing).not.toContain(Capability.StandardReasons);
      expect(skipDisplayName(scenario)).toContain(scenario.missing[0]);
    }

    // The rest run on the declaration alone.
    const running = plansWithout(Capability.Events, Capability.StandardReasons).filter(
      (scenario) => scenario.tags.includes(Capability.StandardReasons) && !scenario.missing.length,
    );
    expect(running).toHaveLength(6);
  });

  it('leaves the untargeted-context scenario mandatory, no capability gating it', () => {
    // The only scenario that supplies a context with no targeting involved. It must not be gated: a
    // provider that threw on any context would otherwise be skipped rather than failed.
    const all = plansWithout();
    const untargeted = all.find(
      (scenario) => scenario.title === 'Supplying an evaluation context does not disturb an untargeted resolution',
    );

    expect(untargeted).toBeDefined();
    expect(untargeted?.missing).toEqual([]);
  });

  it('words the skip so a reader can tell a declined capability from an unaskable one', () => {
    // One skip status, so the reason carries the distinction: "the provider declined" is a fact
    // about this adoption, and "no provider in this language can be asked" is a fact about the SDK.
    const declined = plansWithout(Capability.Events).filter((scenario) => scenario.missing.includes(Capability.Object));
    const unaskable = plansWithout(Capability.Events).filter((scenario) =>
      scenario.missing.includes(Capability.NumericCoercion),
    );

    expect(declined.length).toBeGreaterThan(0);
    for (const scenario of declined) {
      expect(skipDisplayName(scenario)).toContain(`SKIPPED: provider does not declare ${Capability.Object}`);
    }

    expect(unaskable).toHaveLength(3);
    for (const scenario of unaskable) {
      expect(skipDisplayName(scenario)).toBe(
        `${scenario.title} — SKIPPED: this SDK cannot ask ${Capability.NumericCoercion} of any ` +
          `provider: ${inexpressibleReason(Capability.NumericCoercion)}`,
      );
      // The language property travels with the skip rather than sitting a lookup away in the
      // capability's documentation.
      expect(skipDisplayName(scenario)).toContain('single numeric type');
      expect(skipDisplayName(scenario)).not.toContain('does not declare');
    }
  });

  it('emits both clauses for a scenario gated by one of each, naming its own capabilities to each', () => {
    // No canonical scenario is in this position today, which is why it is worth pinning: an upstream
    // file composing @numeric-coercion with an ordinary tag must not lose either half of the reason.
    const [planned] = synthetic(
      [
        'Feature: composed gates',
        '',
        '  @object @numeric-coercion',
        '  Scenario: a structured flag asked for as an integer',
        '    Given a String-flag with key "string-flag" and a default value "x"',
        '',
      ],
      [Capability.Events],
    );
    const name = skipDisplayName(planned);

    expect(planned.missing).toEqual([Capability.Object, Capability.NumericCoercion]);
    expect(name).toContain(`provider does not declare ${Capability.Object}`);
    expect(name).toContain(`this SDK cannot ask ${Capability.NumericCoercion}`);
    expect(name.indexOf('does not declare')).toBeLessThan(name.indexOf('cannot ask'));
  });

  it('names every capability a scenario is missing, not only the first', () => {
    // Withdrawing either capability is enough to keep the scenario from running, so the reader has
    // to be able to see both.
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
      { key: 'boolean-flag', requested: 'Integer', default: '1' },
      { key: 'boolean-flag', requested: 'Float', default: '0.1' },
      { key: 'integer-flag', requested: 'Boolean', default: 'false' },
      { key: 'float-flag', requested: 'Boolean', default: 'false' },
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
    //
    // Only the outline's three rows appear: errors.feature's structured-as-JSON-text scenario also
    // carries @object, and it is a plain Scenario rather than an outline row, so it has no example
    // to carry and the filter leaves it out.
    const skipped = plansWithout(Capability.Events).filter(
      (scenario) => scenario.missing.includes(Capability.Object) && scenario.example,
    );

    expect(skipped.map((scenario) => scenario.example)).toEqual([
      { requested: 'Boolean', default: 'false' },
      { requested: 'Integer', default: '1' },
      { requested: 'Float', default: '0.1' },
    ]);
  });
});
