import type { IJestLike } from 'jest-cucumber';
import { autoBindSteps, loadFeatures, parseFeature } from 'jest-cucumber';
import { adopterSkipReason, adopterTagFilter, resolveAdopterTags } from './adopterTags';
import { Capability, DECLARABLE_CAPABILITIES } from './capability';
import type { TckFeature } from './runProviderTck';
import { FEATURES_GLOB, planFeatures } from './runProviderTck';
import { planScenarios, skipDisplayName } from './scenarioRunner';

/**
 * An adopter's own feature, standing in for the motivating case: one set of extension features run
 * by two harnesses, where `@rpc` and `@in-process` say which mode a scenario belongs to and
 * `@fractional-v1` a rule the provider has retired.
 *
 * The untagged scenario is the one that distinguishes the two readings of an include, and the
 * `@rpc @fractional-v1` one the two the exclusion has to win over. Steps are deliberately all the
 * same text: one definition binds the lot where a scenario is actually defined.
 */
const extensionText = [
  "Feature: an adopter's own scenarios",
  '',
  '  Scenario: an untagged extension scenario',
  '    Given a stable provider',
  '',
  '  @rpc',
  '  Scenario: an rpc extension scenario',
  '    Given a stable provider',
  '',
  '  @in-process',
  '  Scenario: an in-process extension scenario',
  '    Given a stable provider',
  '',
  '  @rpc @fractional-v1',
  '  Scenario: an rpc scenario of a retired rule',
  '    Given a stable provider',
  '',
  '  @rpc @stale',
  '  Scenario: an rpc scenario needing a capability',
  '    Given a stable provider',
  '',
].join('\n');

const extension = parseFeature(extensionText);

/** Everything declarable but `@stale`, so one fixture scenario is gated by a capability as well. */
const declared = new Set(DECLARABLE_CAPABILITIES.filter((capability) => capability !== Capability.Stale));

/** The extension feature's scenarios, planned under a selection, looked up by title. */
const planWith = (includeTags?: string[], excludeTags?: string[]) => {
  const planned = planScenarios(extension, declared, resolveAdopterTags({ includeTags, excludeTags }));
  return (title: string) => {
    const scenario = planned.find((candidate) => candidate.title === title);
    if (!scenario) {
      throw new Error(`no scenario "${title}" was planned; the fixture and the test disagree`);
    }
    return scenario;
  };
};

describe("an adopter's tag selection", () => {
  it('skips exactly the scenarios the plan gives a reason for, an untagged one under an include included', () => {
    // Driven through jest-cucumber, because the tag filter is where the skip actually happens --
    // `loadFeature` only records the expression and `defineFeature` acts on it -- while the plan
    // supplies the wording. The two agreeing is the whole guarantee: a scenario the filter drops
    // with no planned reason is reported as skipped "for a reason the TCK did not ask for", and one
    // the plan deselects that the filter lets through runs regardless of what the plan says.
    //
    // The untagged scenario is the case that distinguishes the two readings of an include. Under the
    // other one -- an include as a hint that only redirects tagged scenarios -- an extension
    // scenario nobody got round to tagging would run in every harness, which is exactly the scenario
    // a two-mode adoption most needs placed.
    const selection = resolveAdopterTags({ includeTags: ['@rpc'], excludeTags: ['@fractional-v1'] });
    const parsed = parseFeature(extensionText, { tagFilter: adopterTagFilter(selection) });

    // Everything declared, so a capability gate cannot account for any of the skips below.
    const planned = planScenarios(parsed, new Set(DECLARABLE_CAPABILITIES), selection);

    const ran: string[] = [];
    const skipped: string[] = [];
    const into = (titles: string[]) => (title: string) => {
      titles.push(title);
    };
    const describeFeature = (_title: string, body: (...args: unknown[]) => void) => body();
    parsed.options.runner = {
      describe: Object.assign(describeFeature, { skip: describeFeature, only: describeFeature }),
      test: Object.assign(into(ran), { skip: into(skipped), only: into(ran), concurrent: into(ran) }),
    } as IJestLike;

    // One `autoBindSteps` call in this file: step definitions accumulate in jest-cucumber's module
    // state, so a second call registering the same matcher would report every step as ambiguous.
    autoBindSteps(
      [parsed],
      [
        ({ given }) => {
          given(/^a stable provider$/, () => undefined);
        },
      ],
    );

    expect(skipped).toEqual([
      'an untagged extension scenario',
      'an in-process extension scenario',
      'an rpc scenario of a retired rule',
    ]);
    expect(ran).toEqual(['an rpc extension scenario', 'an rpc scenario needing a capability']);
    expect(skipped).toEqual(planned.filter((scenario) => scenario.deselectedBecause).map(({ title }) => title));
  });

  it('reads an include as a filter rather than a hint, so an untagged scenario is skipped with a reason', () => {
    const scenario = planWith(['@rpc'])('an untagged extension scenario');

    expect(scenario.tags).toEqual([]);
    expect(scenario.deselectedBecause).toBe('scenario carries none of @rpc, named by includeTags');
  });

  it('leaves canonical scenarios alone however the selection reads on them', () => {
    // The exemption, asserted through the function the harness plans with. The selection names a tag
    // nothing carries, so under it every scenario it reaches is deselected -- which is how the
    // extension half below shows the call was not a no-op.
    const canonical = loadFeatures(FEATURES_GLOB);
    expect(canonical.length).toBeGreaterThan(0);

    const features: TckFeature[] = [
      ...canonical.map((parsed) => ({ feature: parsed.title, parsed, canonical: true })),
      { feature: 'vendor', parsed: extension, canonical: false },
    ];

    const plans = planFeatures(features, declared, resolveAdopterTags({ includeTags: ['@nothing-carries-this'] }));
    const conformance = plans.slice(0, canonical.length).flat();
    const adopters = plans[canonical.length];

    expect(conformance.length).toBeGreaterThan(0);
    expect(conformance.filter((scenario) => scenario.deselectedBecause)).toEqual([]);

    expect(adopters).toHaveLength(5);
    for (const scenario of adopters) {
      expect(scenario.deselectedBecause).toContain('@nothing-carries-this');
    }
  });

  it('lets an exclusion win over an inclusion, naming the excluded tag as the reason', () => {
    // Carrying both, the scenario is skipped as excluded rather than run as included: the two are
    // not symmetric claims. An include says which scenarios are this suite's, an exclude that this
    // one is nobody's.
    const scenario = planWith(['@rpc'], ['@fractional-v1'])('an rpc scenario of a retired rule');

    expect(scenario.deselectedBecause).toBe('scenario carries @fractional-v1, named by excludeTags');
    expect(scenario.deselectedBecause).not.toContain('includeTags');

    // Both halves of that: the included tag alone still runs, and the excluded one alone is still out.
    expect(planWith(['@rpc'], ['@fractional-v1'])('an rpc extension scenario').deselectedBecause).toBeUndefined();
    expect(planWith(undefined, ['@fractional-v1'])('an rpc scenario of a retired rule').deselectedBecause).toBe(
      'scenario carries @fractional-v1, named by excludeTags',
    );
  });

  it('names the tag that caused the skip in the name the scenario is reported under', () => {
    // Jest has nowhere but the name to put it, and the reader of a skipped scenario is looking for
    // which line of their own configuration to change -- so the tag, not just the option.
    const excluded = planWith(['@rpc'], ['@fractional-v1'])('an rpc scenario of a retired rule');
    const notIncluded = planWith(['@rpc'])('an in-process extension scenario');

    expect(skipDisplayName(excluded)).toBe(
      'an rpc scenario of a retired rule — SKIPPED: scenario carries @fractional-v1, named by excludeTags',
    );
    expect(skipDisplayName(notIncluded)).toBe(
      'an in-process extension scenario — SKIPPED: scenario carries none of @rpc, named by includeTags',
    );
  });

  it('is reported ahead of the capability declaration, which the suite never got to put', () => {
    // The gate order, pinned. A scenario the adoption deselected is not a capability the provider
    // withheld: naming the declaration here would have a report say the provider declined @stale
    // when this suite never asked it. @stale is an ordinary undeclared capability -- a reserved tag
    // would fail the whole run before any of this, and an inexpressible one outranks the selection.
    const deselectedAndGated = planWith(['@in-process'])('an rpc scenario needing a capability');

    expect(deselectedAndGated.missing).toEqual([Capability.Stale]);
    expect(skipDisplayName(deselectedAndGated)).toBe(
      'an rpc scenario needing a capability — SKIPPED: scenario carries none of @in-process, named by includeTags',
    );
    expect(skipDisplayName(deselectedAndGated)).not.toContain('does not declare');

    // With the selection satisfied, the declaration is what is left to report -- so the assertion
    // above is about the order and not about the capability gate having gone missing.
    const gatedOnly = planWith(['@rpc'])('an rpc scenario needing a capability');
    expect(gatedOnly.deselectedBecause).toBeUndefined();
    expect(skipDisplayName(gatedOnly)).toBe(
      `an rpc scenario needing a capability — SKIPPED: provider does not declare ${Capability.Stale}`,
    );
  });

  it('selects every extension scenario when neither option is given', () => {
    const selection = resolveAdopterTags({});

    expect(selection).toEqual({ include: [], exclude: [] });
    // No expression at all rather than one that matches everything, so a suite naming nothing loads
    // its features exactly as it did before this gate existed.
    expect(adopterTagFilter(selection)).toBeUndefined();
    for (const scenario of planScenarios(extension, declared, selection)) {
      expect(scenario.deselectedBecause).toBeUndefined();
    }
  });

  it('refuses a capability tag in either option, so it cannot skip what a declaration claims', () => {
    // The refusal that matters beyond spelling: @events named here would let a suite skip scenarios
    // for a capability it declares, and the two gates would be able to contradict each other.
    const named: [string, (tags: string[]) => void][] = [
      ['includeTags', (includeTags) => resolveAdopterTags({ includeTags })],
      ['excludeTags', (excludeTags) => resolveAdopterTags({ excludeTags })],
    ];

    for (const [option, resolve] of named) {
      expect(() => resolve([Capability.Events])).toThrow(
        new RegExp(`${option} names the TCK capability tag ${Capability.Events}`),
      );
      expect(() => resolve([Capability.Events])).toThrow(/capabilities instead/);
      // Case is not a way round it: the filter this becomes compares tags lowercased, so a
      // differently cased capability tag would gate the very same scenarios.
      expect(() => resolve(['@EVENTS'])).toThrow(/capability tag @EVENTS/);
    }

    // An adopter's own tag that merely resembles one is still fine.
    expect(() => resolveAdopterTags({ excludeTags: ['@events-v2'] })).not.toThrow();
  });

  it('refuses a malformed tag rather than selecting nothing with it', () => {
    // A tag that matches nothing is invisible under an exclude and catastrophic under an include --
    // every extension scenario skipped -- so it is refused at suite start instead.
    for (const malformed of ['rpc', '@', '', ' @rpc', '@rpc ']) {
      expect(() => resolveAdopterTags({ includeTags: [malformed] })).toThrow(/a Gherkin tag starts with/);
      expect(() => resolveAdopterTags({ excludeTags: [malformed] })).toThrow(/a Gherkin tag starts with/);
    }

    expect(() => resolveAdopterTags({ includeTags: ['@rpc'], excludeTags: ['@in-process'] })).not.toThrow();
  });

  it('refuses one tag named both ways, a tag being one or the other', () => {
    expect(() => resolveAdopterTags({ includeTags: ['@rpc'], excludeTags: ['@rpc'] })).toThrow(
      /both name @rpc; a tag is one or the other/,
    );

    // The same tag twice in one option is a duplicate rather than a contradiction, and is simply
    // collapsed: the reason it produces must name it once.
    expect(resolveAdopterTags({ excludeTags: ['@rpc', '@rpc'] })).toEqual({ include: [], exclude: ['@rpc'] });
    expect(adopterSkipReason(['@rpc'], resolveAdopterTags({ excludeTags: ['@rpc', '@rpc'] }))).toBe(
      'scenario carries @rpc, named by excludeTags',
    );
  });

  it('builds one or-group for the include, so an exclusion cannot be excused by it', () => {
    // `not @old and @rpc or @shared` would read as `(not @old and @rpc) or @shared`, which runs an
    // excluded scenario that happens to carry @shared. The group is what stops that.
    expect(adopterTagFilter(resolveAdopterTags({ includeTags: ['@rpc', '@shared'], excludeTags: ['@old'] }))).toBe(
      'not @old and (@rpc or @shared)',
    );
    expect(adopterTagFilter(resolveAdopterTags({ excludeTags: ['@old', '@older'] }))).toBe('not @old and not @older');
    expect(adopterTagFilter(resolveAdopterTags({ includeTags: ['@rpc'] }))).toBe('(@rpc)');

    // And the reason agrees with the expression on the case the grouping is about.
    const selection = resolveAdopterTags({ includeTags: ['@rpc', '@shared'], excludeTags: ['@old'] });
    expect(adopterSkipReason(['@old', '@shared'], selection)).toBe('scenario carries @old, named by excludeTags');
    expect(adopterSkipReason(['@shared'], selection)).toBeUndefined();
  });
});
