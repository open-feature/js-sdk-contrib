import {
  ALL_CAPABILITIES,
  Capability,
  DECLARABLE_CAPABILITIES,
  RESERVED_CAPABILITIES,
  capabilityForTag,
  isReserved,
} from './capability';
import type { BackendControl } from './control';
import { KnownDeviation } from './deviation';
import type { TckOptions } from './options';
import { resolveCapabilities } from './options';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

const optionsFor = (overrides: Partial<TckOptions> = {}): TckOptions => ({
  name: 'unit',
  control,
  newProvider: () => {
    throw new Error('no provider is constructed while resolving options');
  },
  ...overrides,
});

describe('the reserved capabilities', () => {
  it('are the ones no scenario carries, and are not declarable', () => {
    // The list lives in one place so it cannot drift from the rule. That it matches the feature
    // files is checked by the harness on every run, against what actually ran.
    expect(RESERVED_CAPABILITIES).toEqual([Capability.Targeting, Capability.Caching]);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Targeting);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Caching);
    expect(DECLARABLE_CAPABILITIES.length).toBe(ALL_CAPABILITIES.length - RESERVED_CAPABILITIES.length);
  });

  it('are still recognised as tags, because a tag has to be recognised to be refused', () => {
    for (const capability of RESERVED_CAPABILITIES) {
      expect(ALL_CAPABILITIES).toContain(capability);
    }
  });
});

describe('the @reinitialization capability', () => {
  // Requirement 2.5.2 says a provider SHOULD revert to its uninitialized state after shutdown, and
  // that "some providers MAY allow reinitialization from this state". Permitted, not required — so
  // the reuse scenario has to be gated, and the gate has to be declarable. A provider that declines
  // reuse leaves it undeclared and the scenario skips; the wrong move is to declare it and record a
  // deviation, which reports a sanctioned choice as a defect.
  it('is declarable, because declining reuse is a choice and offering it is a claim', () => {
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.Reinitialization);
    expect(isReserved(Capability.Reinitialization)).toBe(false);
  });

  it('resolves from the tag the gated scenario carries', () => {
    expect(capabilityForTag('@reinitialization')).toBe(Capability.Reinitialization);
  });

  it('is left out when a suite narrows the default, without needing a deviation', () => {
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Lifecycle] }),
    );

    expect(declared.has(Capability.Lifecycle)).toBe(true);
    expect(declared.has(Capability.Reinitialization)).toBe(false);
    expect(undeclared).toContain(Capability.Reinitialization);
    expect(knownDeviations).toEqual([]);
  });
});

describe('resolving a suite capabilities', () => {
  it('declares every declarable capability by default, and no reserved one', () => {
    // "Declare everything" is the recommended starting point for a new adoption, and it must not
    // mean "declare things nothing tested" -- which is exactly how a real Java report came to
    // assert @targeting and @caching.
    const { declared } = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect([...declared].sort()).toEqual([...DECLARABLE_CAPABILITIES].sort());
    for (const capability of RESERVED_CAPABILITIES) {
      expect(declared.has(capability)).toBe(false);
    }
  });

  it('leaves an inapplicable capability out of the default, without restating the whole set', () => {
    const { declared, notApplicable } = resolveCapabilities(
      optionsFor({
        newUnavailableProvider: () => ({}) as never,
        notApplicable: { [Capability.NumericCoercion]: 'no integer type' },
      }),
    );

    expect(declared.has(Capability.NumericCoercion)).toBe(false);
    expect(declared.has(Capability.Events)).toBe(true);
    expect(notApplicable.get(Capability.NumericCoercion)).toBe('no integer type');
  });

  it('refuses a suite that declares a reserved capability', () => {
    // Refused rather than dropped: a suite that asked for a claim it cannot have should be told,
    // not quietly corrected into a report that no longer matches what it wrote.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.Targeting] }))).toThrow(
      /@targeting, which no scenario carries/,
    );
  });

  it('refuses a reserved capability declared inapplicable, which is a claim about nothing', () => {
    expect(() =>
      resolveCapabilities(optionsFor({ capabilities: [], notApplicable: { [Capability.Caching]: 'no cache' } })),
    ).toThrow(/@caching, which no scenario carries/);
  });

  it('reports every reserved capability a suite named, rather than only the first', () => {
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Targeting, Capability.Caching] }))).toThrow(
      /@targeting @caching/,
    );
  });

  it('gates on the declarable capabilities a suite left out', () => {
    const { undeclared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));

    // A reserved capability is absent from the gate, and its absence gates nothing: no scenario
    // carries it, so there is nothing for 'not @targeting' to exclude.
    expect(undeclared).not.toContain(Capability.Events);
    expect(undeclared).not.toContain(Capability.Targeting);
    expect(undeclared).toContain(Capability.Stale);
    expect(undeclared.length).toBe(DECLARABLE_CAPABILITIES.length - 1);
  });

  it('refuses a capability that is both declared and inapplicable', () => {
    expect(() =>
      resolveCapabilities(
        optionsFor({
          capabilities: [Capability.NumericCoercion],
          notApplicable: { [Capability.NumericCoercion]: 'no integer type' },
        }),
      ),
    ).toThrow(/both list @numeric-coercion/);
  });

  it('refuses @unavailable without a provider pointed at a backend that does not exist', () => {
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.UnavailableInit] }))).toThrow(
      /newUnavailableProvider is not set/,
    );
  });
});

describe('a known deviation', () => {
  it('records the capability, the issue and the summary a tracked gap has', () => {
    const deviation = KnownDeviation.tracked(
      Capability.Stale,
      'https://github.com/open-feature/js-sdk-contrib/issues/1',
      'never leaves STALE',
    );

    expect(deviation).toEqual({
      capability: Capability.Stale,
      issue: 'https://github.com/open-feature/js-sdk-contrib/issues/1',
      summary: 'never leaves STALE',
    });
  });

  it('leaves the issue absent on an untracked gap rather than inventing one', () => {
    // Absent rather than empty: a consumer asking "is this tracked?" must not have to decide
    // whether '' counts, and a report that serialises the field has nothing to omit either.
    const deviation = KnownDeviation.untracked(Capability.Lifecycle, 'shutdown does not clear the latch');

    expect(deviation.issue).toBeUndefined();
    expect('issue' in deviation).toBe(false);
    expect(deviation).toEqual({ capability: Capability.Lifecycle, summary: 'shutdown does not clear the latch' });
  });

  it('records a gap against a mandatory scenario, which belongs to no capability', () => {
    const deviation = KnownDeviation.untracked(undefined, 'resolves missing-flag as a default rather than an error');

    expect('capability' in deviation).toBe(false);
    expect(deviation.summary).toMatch(/missing-flag/);
  });

  it('rides alongside the capability it concerns, rather than replacing the declaration', () => {
    // The point of the type: withdrawing @lifecycle would replace a failing scenario with a skip
    // and make a defect look deliberate. Declaring both leaves the scenario running.
    const { declared, knownDeviations } = resolveCapabilities(
      optionsFor({
        capabilities: [Capability.Lifecycle],
        knownDeviations: [KnownDeviation.untracked(Capability.Lifecycle, 'shutdown does not clear the latch')],
      }),
    );

    expect(declared.has(Capability.Lifecycle)).toBe(true);
    expect(knownDeviations).toHaveLength(1);
    expect(knownDeviations[0].capability).toBe(Capability.Lifecycle);
  });

  it('is empty, not undefined, when a suite declares none', () => {
    expect(resolveCapabilities(optionsFor({ capabilities: [] })).knownDeviations).toEqual([]);
  });

  it('refuses a reserved capability, which leaves nothing to deviate from', () => {
    expect(() =>
      resolveCapabilities(
        optionsFor({ knownDeviations: [KnownDeviation.untracked(Capability.Caching, 'no cache at all')] }),
      ),
    ).toThrow(/@caching, which no scenario carries/);
  });

  it('refuses a deviation with no summary, which says nothing an omission does not', () => {
    expect(() =>
      resolveCapabilities(optionsFor({ knownDeviations: [KnownDeviation.untracked(Capability.Stale, '   ')] })),
    ).toThrow(/with no summary/);
  });

  it('refuses a capability that is both inapplicable and deviant', () => {
    expect(() =>
      resolveCapabilities(
        optionsFor({
          capabilities: [],
          notApplicable: { [Capability.NumericCoercion]: 'no integer type' },
          knownDeviations: [KnownDeviation.untracked(Capability.NumericCoercion, 'narrows 0.5 to 0')],
        }),
      ),
    ).toThrow(/both name @numeric-coercion/);
  });
});
